-- Normalize the legacy partner schema to the active affiliate flow without touching production data.
ALTER TABLE public.partner_requests
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS crc_number text,
  ADD COLUMN IF NOT EXISTS pix_type text,
  ADD COLUMN IF NOT EXISTS pix_key text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.partner_requests
  ALTER COLUMN pix_type DROP NOT NULL,
  ALTER COLUMN pix_key DROP NOT NULL,
  ALTER COLUMN status SET DEFAULT 'pending_approval';

UPDATE public.partner_requests
SET status = 'pending_approval', updated_at = COALESCE(updated_at, now())
WHERE status IS NULL OR status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS partner_requests_user_id_unique
  ON public.partner_requests(user_id);

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS commission_percent integer DEFAULT 20,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.coupons
SET commission_percent = CASE
  WHEN commission_percent BETWEEN 20 AND 30 THEN commission_percent
  ELSE 20
END
WHERE commission_percent IS NULL OR commission_percent NOT BETWEEN 20 AND 30;

ALTER TABLE public.coupons
  ALTER COLUMN commission_percent SET DEFAULT 20;

ALTER TABLE public.coupons
  DROP CONSTRAINT IF EXISTS coupons_commission_percent_check;
ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_commission_percent_check
  CHECK (commission_percent BETWEEN 20 AND 30);

CREATE UNIQUE INDEX IF NOT EXISTS coupons_partner_id_unique
  ON public.coupons(partner_id)
  WHERE partner_id IS NOT NULL;

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_id uuid,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS payment_id text;

ALTER TABLE public.commissions ALTER COLUMN amount SET DEFAULT 0;
ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_subscription_id_fkey;
ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_subscription_id_fkey
  FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'commissions' AND column_name = 'amount'
  ) THEN
    EXECUTE 'UPDATE public.commissions SET amount_cents = round(amount * 100)::bigint WHERE amount_cents = 0 AND amount IS NOT NULL AND amount > 0';
  END IF;
END
$migration$;

-- Use a non-partial unique index so the webhook's ON CONFLICT (payment_id)
-- is inferred by PostgreSQL. UNIQUE permits multiple NULL values.
DROP INDEX IF EXISTS public.commissions_payment_id_unique;
CREATE UNIQUE INDEX commissions_payment_id_unique
  ON public.commissions(payment_id);

-- A shape-valid CPF/CNPJ is not proof of an active official registration. This only checks
-- the mathematical digits; official status must be confirmed separately during approval.
CREATE OR REPLACE FUNCTION public.is_valid_cpf_cnpj(p_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path TO public, pg_temp
AS $function$
DECLARE
  digits text := regexp_replace(p_value, '\D', '', 'g');
  digit_sum integer := 0;
  remainder integer := 0;
  expected integer := 0;
  i integer;
  weight integer;
BEGIN
  IF length(digits) NOT IN (11, 14) OR digits = repeat(substr(digits, 1, 1), length(digits)) THEN
    RETURN false;
  END IF;

  IF length(digits) = 11 THEN
    FOR i IN 1..9 LOOP
      digit_sum := digit_sum + substring(digits, i, 1)::integer * (11 - i);
    END LOOP;
    remainder := (digit_sum * 10) % 11;
    expected := CASE WHEN remainder = 10 THEN 0 ELSE remainder END;
    IF expected <> substring(digits, 10, 1)::integer THEN RETURN false; END IF;

    digit_sum := 0;
    FOR i IN 1..10 LOOP
      digit_sum := digit_sum + substring(digits, i, 1)::integer * (12 - i);
    END LOOP;
    remainder := (digit_sum * 10) % 11;
    expected := CASE WHEN remainder = 10 THEN 0 ELSE remainder END;
    RETURN expected = substring(digits, 11, 1)::integer;
  END IF;

  digit_sum := 0;
  FOR i IN 1..12 LOOP
    weight := CASE WHEN i <= 4 THEN 6 - i ELSE 14 - i END;
    digit_sum := digit_sum + substring(digits, i, 1)::integer * weight;
  END LOOP;
  remainder := digit_sum % 11;
  expected := CASE WHEN remainder < 2 THEN 0 ELSE 11 - remainder END;
  IF expected <> substring(digits, 13, 1)::integer THEN RETURN false; END IF;

  digit_sum := 0;
  FOR i IN 1..13 LOOP
    weight := CASE WHEN i <= 5 THEN 7 - i ELSE 15 - i END;
    digit_sum := digit_sum + substring(digits, i, 1)::integer * weight;
  END LOOP;
  remainder := digit_sum % 11;
  expected := CASE WHEN remainder < 2 THEN 0 ELSE 11 - remainder END;
  RETURN expected = substring(digits, 14, 1)::integer;
END
$function$;

CREATE OR REPLACE FUNCTION public.is_valid_pix_key(p_type text, p_key text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO public, pg_temp
AS $function$
DECLARE
  key_type text := lower(trim(COALESCE(p_type, '')));
  key_value text := trim(COALESCE(p_key, ''));
  digits text := regexp_replace(COALESCE(p_key, ''), '[^0-9]', '', 'g');
BEGIN
  IF key_type = '' OR key_value = '' OR length(key_value) > 180 THEN
    RETURN false;
  END IF;
  CASE key_type
    WHEN 'cpf' THEN
      RETURN length(digits) = 11 AND public.is_valid_cpf_cnpj(digits);
    WHEN 'cnpj' THEN
      RETURN length(digits) = 14 AND public.is_valid_cpf_cnpj(digits);
    WHEN 'email' THEN
      RETURN key_value ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
    WHEN 'phone' THEN
      RETURN length(digits) BETWEEN 10 AND 13;
    WHEN 'random' THEN
      RETURN length(key_value) BETWEEN 3 AND 180;
    ELSE
      RETURN false;
  END CASE;
END
$function$;

CREATE OR REPLACE FUNCTION public.submit_partner_request(
  _full_name text,
  _tax_id text,
  _crc_number text,
  _pix_type text DEFAULT NULL,
  _pix_key text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  existing_status text;
  payout_type text := NULLIF(lower(trim(_pix_type)), '');
  payout_key text := NULLIF(trim(_pix_key), '');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _full_name IS NULL
     OR length(trim(_full_name)) NOT BETWEEN 2 AND 160
     OR _tax_id IS NULL
     OR NOT public.is_valid_cpf_cnpj(_tax_id)
     OR _crc_number IS NULL
     OR upper(trim(_crc_number)) !~ '^[A-Z]{2}-[0-9]{6}/[A-Z]
  THEN RAISE EXCEPTION 'invalid partner identity'; END IF;

  IF (payout_type IS NULL) <> (payout_key IS NULL) THEN
    RAISE EXCEPTION 'PIX type and key must be provided together';
  END IF;
  IF payout_type IS NOT NULL AND NOT public.is_valid_pix_key(payout_type, payout_key) THEN
    RAISE EXCEPTION 'invalid payout details';
  END IF;

  SELECT status INTO existing_status
  FROM public.partner_requests WHERE user_id = uid;
  IF existing_status = 'approved' THEN
    RAISE EXCEPTION 'approved partner identity cannot be changed here';
  END IF;

  -- Keep the legal name consistent in the accountant dashboard, payment identity and profile.
  UPDATE public.profiles
  SET full_name = trim(_full_name)
  WHERE user_id = uid;

  INSERT INTO public.partner_requests(
    user_id, full_name, tax_id, crc_number, pix_type, pix_key, status, email, updated_at
  )
  VALUES (
    uid,
    trim(_full_name),
    regexp_replace(_tax_id, '[^0-9]', '', 'g'),
    upper(trim(_crc_number)),
    payout_type,
    payout_key,
    'pending_approval',
    (SELECT lower(email) FROM auth.users WHERE id = uid),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    tax_id = EXCLUDED.tax_id,
    crc_number = EXCLUDED.crc_number,
    pix_type = EXCLUDED.pix_type,
    pix_key = EXCLUDED.pix_key,
    email = EXCLUDED.email,
    status = 'pending_approval',
    updated_at = now();
END
$function$;

CREATE OR REPLACE FUNCTION public.update_partner_payout(_pix_type text, _pix_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  partner_status text;
  payout_type text := NULLIF(lower(trim(_pix_type)), '');
  payout_key text := NULLIF(trim(_pix_key), '');
  confirmed_referrals integer := 0;
  payout_rate integer := 20;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF (payout_type IS NULL) <> (payout_key IS NULL) THEN
    RAISE EXCEPTION 'PIX type and key must be provided together';
  END IF;
  IF payout_type IS NOT NULL AND NOT public.is_valid_pix_key(payout_type, payout_key) THEN
    RAISE EXCEPTION 'invalid payout details';
  END IF;

  UPDATE public.partner_requests
  SET pix_type = payout_type, pix_key = payout_key, updated_at = now()
  WHERE user_id = uid
  RETURNING status INTO partner_status;
  IF NOT FOUND THEN RAISE EXCEPTION 'partner request not found'; END IF;

  IF partner_status = 'approved' AND payout_type IS NOT NULL AND payout_key IS NOT NULL
     AND public.is_valid_pix_key(payout_type, payout_key) THEN
    SELECT count(DISTINCT s.user_id)::integer INTO confirmed_referrals
    FROM public.subscriptions s
    WHERE s.affiliate_partner_id = uid AND s.paid_at IS NOT NULL;
    payout_rate := CASE WHEN confirmed_referrals <= 5 THEN 20 WHEN confirmed_referrals <= 15 THEN 25 ELSE 30 END;

    UPDATE public.coupons
    SET is_active = true, commission_percent = payout_rate, updated_at = now()
    WHERE partner_id = uid;

    IF NOT FOUND THEN
      INSERT INTO public.coupons(partner_id, code, discount_percent, commission_percent, is_active, updated_at)
      VALUES (uid, 'CC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), 10, payout_rate, true, now());
    END IF;
  ELSE
    UPDATE public.coupons SET is_active = false, updated_at = now() WHERE partner_id = uid;
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_partner_status(_partner_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  partner_pix_type text;
  partner_pix_key text;
  confirmed_referrals integer := 0;
  payout_rate integer := 20;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin access required';
  END IF;
  IF _status NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'invalid status'; END IF;

  UPDATE public.partner_requests
  SET status = _status, updated_at = now()
  WHERE user_id = _partner_id
  RETURNING pix_type, pix_key INTO partner_pix_type, partner_pix_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'partner not found'; END IF;

  IF _status = 'approved' AND public.is_valid_pix_key(partner_pix_type, partner_pix_key) THEN
    SELECT count(DISTINCT s.user_id)::integer INTO confirmed_referrals
    FROM public.subscriptions s
    WHERE s.affiliate_partner_id = _partner_id AND s.paid_at IS NOT NULL;
    payout_rate := CASE WHEN confirmed_referrals <= 5 THEN 20 WHEN confirmed_referrals <= 15 THEN 25 ELSE 30 END;

    UPDATE public.coupons
    SET is_active = true, commission_percent = payout_rate, updated_at = now()
    WHERE partner_id = _partner_id;

    IF NOT FOUND THEN
      INSERT INTO public.coupons(partner_id, code, discount_percent, commission_percent, is_active, updated_at)
      VALUES (_partner_id, 'CC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), 10, payout_rate, true, now());
    END IF;
  ELSE
    UPDATE public.coupons SET is_active = false, updated_at = now() WHERE partner_id = _partner_id;
  END IF;
END
$function$;

-- Update the active coupon tier from distinct referred customers whose payment was confirmed.
-- Historical confirmed payers stay counted even if a subscription later cancels.
CREATE OR REPLACE FUNCTION public.sync_partner_coupon_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  affected_partner uuid;
  confirmed_clients integer := 0;
  payout_rate integer := 20;
  payout_is_ready boolean := false;
BEGIN
  FOR affected_partner IN
    SELECT affected.partner_id
    FROM (
      SELECT CASE WHEN TG_OP = 'UPDATE' THEN OLD.affiliate_partner_id ELSE NULL::uuid END AS partner_id
      UNION
      SELECT NEW.affiliate_partner_id AS partner_id
    ) affected
    WHERE affected.partner_id IS NOT NULL
  LOOP
    SELECT count(DISTINCT s.user_id)::integer INTO confirmed_clients
    FROM public.subscriptions s
    WHERE s.affiliate_partner_id = affected_partner
      AND s.paid_at IS NOT NULL;

    payout_rate := CASE
      WHEN confirmed_clients <= 5 THEN 20
      WHEN confirmed_clients <= 15 THEN 25
      ELSE 30
    END;

    SELECT
      pr.status = 'approved'
      AND public.is_valid_pix_key(pr.pix_type, pr.pix_key)
    INTO payout_is_ready
    FROM public.partner_requests pr
    WHERE pr.user_id = affected_partner;

    UPDATE public.coupons c
    SET commission_percent = payout_rate,
        is_active = COALESCE(payout_is_ready, false),
        updated_at = now()
    WHERE c.partner_id = affected_partner;
  END LOOP;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS subscriptions_sync_partner_coupon_rate ON public.subscriptions;
CREATE TRIGGER subscriptions_sync_partner_coupon_rate
AFTER INSERT OR UPDATE OF status, paid_at, affiliate_partner_id
ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_coupon_rate();

-- Maintain explicit customer consent for accountants who want access to clients' financial ledgers.
CREATE TABLE IF NOT EXISTS public.accountant_access (
  client_user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partner_requests(user_id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accountant_access_partner_idx
  ON public.accountant_access(partner_id, client_user_id);
GRANT SELECT ON public.accountant_access TO authenticated;
ALTER TABLE public.accountant_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "accountant_access_read_own" ON public.accountant_access;
CREATE POLICY "accountant_access_read_own" ON public.accountant_access
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = client_user_id OR (SELECT auth.uid()) = partner_id);

CREATE OR REPLACE FUNCTION public.partner_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  result jsonb;
BEGIN
  IF uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.partner_requests
    WHERE user_id = uid AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'approved partner access required';
  END IF;

  SELECT jsonb_build_object(
    'coupon', (
      SELECT jsonb_build_object(
        'code', c.code,
        'discount_percent', c.discount_percent,
        'commission_percent', c.commission_percent
      )
      FROM public.coupons c
      WHERE c.partner_id = uid AND c.is_active
      LIMIT 1
    ),
    'totals', jsonb_build_object(
      'commission_cents', COALESCE((SELECT sum(c.amount_cents) FROM public.commissions c WHERE c.partner_id = uid), 0),
      'pending_cents', COALESCE((SELECT sum(c.amount_cents) FROM public.commissions c WHERE c.partner_id = uid AND c.status IN ('pending','available')), 0),
      'paid_cents', COALESCE((SELECT sum(c.amount_cents) FROM public.commissions c WHERE c.partner_id = uid AND c.status = 'paid'), 0),
      'referred_clients', (
        SELECT count(DISTINCT s.user_id) FROM public.subscriptions s
        WHERE s.affiliate_partner_id = uid AND s.paid_at IS NOT NULL
      ),
      'active_clients', (
        SELECT count(*) FROM public.subscriptions s
        WHERE s.affiliate_partner_id = uid AND s.status = 'active' AND s.paid_at IS NOT NULL
      )
    ),
    'referrals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', s.user_id,
        'client_name', COALESCE(NULLIF(trim(p.full_name), ''), NULLIF(trim(p.business_name), ''), 'Cliente'),
        'plan', COALESCE(s.plan::text, ''),
        'status', s.status,
        'created_at', s.created_at,
        'paid_at', s.paid_at
      ) ORDER BY s.paid_at DESC)
      FROM public.subscriptions s
      JOIN public.profiles p ON p.user_id = s.user_id
      WHERE s.affiliate_partner_id = uid
        AND s.paid_at IS NOT NULL
    ), '[]'::jsonb),
    'commissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'client_name', c.client_name, 'amount_cents', c.amount_cents,
        'status', c.status, 'created_at', c.created_at, 'paid_at', c.paid_at,
        'receipt_url', c.receipt_url
      ) ORDER BY c.created_at DESC)
      FROM public.commissions c
      WHERE c.partner_id = uid
    ), '[]'::jsonb),
    'clients', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'client_name', p.business_name,
        'plan', s.plan::text,
        'status', s.status,
        'entry_count', COALESCE(x.entry_count, 0),
        'income_cents', COALESCE(x.income_cents, 0),
        'expense_cents', COALESCE(x.expense_cents, 0),
        'shared_at', aa.granted_at,
        'entries', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'description', e.description, 'type', e.type, 'amount_cents', e.amount_cents,
            'due_date', e.due_date, 'status', e.status, 'paid_at', e.paid_at
          ) ORDER BY e.due_date)
          FROM public.entries e WHERE e.user_id = aa.client_user_id
        ), '[]'::jsonb)
      ) ORDER BY p.business_name)
      FROM public.accountant_access aa
      JOIN public.subscriptions s ON s.user_id = aa.client_user_id AND s.affiliate_partner_id = uid
      JOIN public.profiles p ON p.user_id = aa.client_user_id
      LEFT JOIN LATERAL (
        SELECT count(*) AS entry_count,
          COALESCE(sum(amount_cents) FILTER (WHERE type = 'income'), 0) AS income_cents,
          COALESCE(sum(amount_cents) FILTER (WHERE type = 'expense'), 0) AS expense_cents
        FROM public.entries e WHERE e.user_id = aa.client_user_id
      ) x ON true
      WHERE aa.partner_id = uid
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_partner_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin access required';
  END IF;

  SELECT jsonb_build_object(
    'partners', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', pr.user_id,
        'name', pr.full_name,
        'email', COALESCE(pr.email, au.email),
        'status', pr.status,
        'tax_id', pr.tax_id,
        'crc_number', pr.crc_number,
        'pix_type', pr.pix_type,
        'pix_key', pr.pix_key,
        'coupon_code', cp.code,
        'commission_percent', cp.commission_percent,
        'referrals', (
          SELECT count(DISTINCT s.user_id) FROM public.subscriptions s
          WHERE s.affiliate_partner_id = pr.user_id AND s.paid_at IS NOT NULL
        )
      ) ORDER BY pr.created_at DESC)
      FROM public.partner_requests pr
      LEFT JOIN auth.users au ON au.id = pr.user_id
      LEFT JOIN public.coupons cp ON cp.partner_id = pr.user_id
    ), '[]'::jsonb),
    'commissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'partner_id', c.partner_id,
        'partner_name', pr.full_name,
        'client_name', c.client_name,
        'amount', (c.amount_cents::numeric / 100),
        'status', c.status,
        'created_at', c.created_at,
        'paid_at', c.paid_at
      ) ORDER BY c.created_at DESC)
      FROM public.commissions c
      LEFT JOIN public.partner_requests pr ON pr.user_id = c.partner_id
    ), '[]'::jsonb),
    'clients', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', s.user_id,
        'partner_id', s.affiliate_partner_id,
        'partner_name', pr.full_name,
        'client_name', COALESCE(NULLIF(trim(p.full_name), ''), NULLIF(trim(p.business_name), ''), 'Cliente'),
        'client_email', COALESCE(p.email, au.email),
        'subscription_status', s.status,
        'created_at', s.created_at,
        'paid_at', s.paid_at
      ) ORDER BY s.paid_at DESC)
      FROM public.subscriptions s
      JOIN public.partner_requests pr ON pr.user_id = s.affiliate_partner_id
      JOIN public.profiles p ON p.user_id = s.user_id
      LEFT JOIN auth.users au ON au.id = s.user_id
      WHERE s.affiliate_partner_id IS NOT NULL
        AND s.paid_at IS NOT NULL
    ), '[]'::jsonb),
    'total_commissions', (SELECT count(*) FROM public.commissions),
    'total_commission_amount', COALESCE((SELECT sum(c.amount_cents)::numeric / 100 FROM public.commissions c), 0),
    'total_clients', (SELECT count(DISTINCT s.user_id) FROM public.subscriptions s WHERE s.affiliate_partner_id IS NOT NULL AND s.paid_at IS NOT NULL)
  ) INTO result;

  RETURN result;
END
$function$;

REVOKE ALL ON FUNCTION public.partner_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_partner_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_partner_overview() TO authenticated;

-- Only the owner of the document set and genuine administrators may read it.
DROP POLICY IF EXISTS "Partner applicants can read their own documents" ON public.partner_application_documents;
CREATE POLICY "Partner applicants can read their own documents"
ON public.partner_application_documents FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Administrators can review partner documents" ON public.partner_application_documents;
CREATE POLICY "Administrators can review partner documents"
ON public.partner_application_documents FOR SELECT TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Partner applicants can submit their own documents" ON public.partner_application_documents;
CREATE POLICY "Partner applicants can submit their own documents"
ON public.partner_application_documents FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND crc_document_path LIKE (SELECT auth.uid())::text || '/crc-%'
  AND identity_document_path LIKE (SELECT auth.uid())::text || '/identidade-%'
  AND address_document_path LIKE (SELECT auth.uid())::text || '/endereco-%'
  AND lower(crc_document_path) ~ '\.(pdf|csv|xls|xlsx)$'
  AND lower(identity_document_path) ~ '\.(pdf|csv|xls|xlsx)$'
  AND lower(address_document_path) ~ '\.(pdf|csv|xls|xlsx)$'
  AND NOT EXISTS (
    SELECT 1 FROM public.partner_requests pr
    WHERE pr.user_id = (SELECT auth.uid()) AND pr.status <> 'rejected'
  )
);

DROP POLICY IF EXISTS "Partner applicants can update their own documents" ON public.partner_application_documents;
CREATE POLICY "Partner applicants can update their own documents"
ON public.partner_application_documents FOR UPDATE TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  AND EXISTS (
    SELECT 1 FROM public.partner_requests pr
    WHERE pr.user_id = (SELECT auth.uid()) AND pr.status = 'rejected'
  )
)
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND crc_document_path LIKE (SELECT auth.uid())::text || '/crc-%'
  AND identity_document_path LIKE (SELECT auth.uid())::text || '/identidade-%'
  AND address_document_path LIKE (SELECT auth.uid())::text || '/endereco-%'
  AND lower(crc_document_path) ~ '\.(pdf|csv|xls|xlsx)$'
  AND lower(identity_document_path) ~ '\.(pdf|csv|xls|xlsx)$'
  AND lower(address_document_path) ~ '\.(pdf|csv|xls|xlsx)$'
  AND EXISTS (
    SELECT 1 FROM public.partner_requests pr
    WHERE pr.user_id = (SELECT auth.uid()) AND pr.status = 'rejected'
  )
);

UPDATE storage.buckets
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
WHERE id = 'partner-application-documents';

DROP POLICY IF EXISTS "Applicants upload their own partner documents" ON storage.objects;
CREATE POLICY "Applicants upload their own partner documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'partner-application-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (
    (lower(name) LIKE '%.pdf' AND COALESCE(metadata->>'mimetype', '') = 'application/pdf')
    OR (lower(name) LIKE '%.csv' AND COALESCE(metadata->>'mimetype', '') = 'text/csv')
    OR (lower(name) LIKE '%.xls' AND COALESCE(metadata->>'mimetype', '') = 'application/vnd.ms-excel')
    OR (lower(name) LIKE '%.xlsx' AND COALESCE(metadata->>'mimetype', '') = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.partner_requests pr
    WHERE pr.user_id = (SELECT auth.uid()) AND pr.status <> 'rejected'
  )
);

DROP POLICY IF EXISTS "Applicants and administrators read partner documents" ON storage.objects;
CREATE POLICY "Applicants and administrators read partner documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'partner-application-documents'
  AND (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  )
);

-- Prevent anonymous access to sensitive RPCs; authorization inside SECURITY DEFINER functions is mandatory.
REVOKE ALL ON FUNCTION public.sync_partner_coupon_rate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_valid_cpf_cnpj(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_valid_pix_key(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_partner_request(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_partner_payout(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_partner_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_cpf_cnpj(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_partner_request(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_partner_payout(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_partner_status(uuid, text) TO authenticated;

  THEN RAISE EXCEPTION 'invalid partner identity'; END IF;

  IF (payout_type IS NULL) <> (payout_key IS NULL) THEN
    RAISE EXCEPTION 'PIX type and key must be provided together';
  END IF;
  IF payout_type IS NOT NULL AND NOT public.is_valid_pix_key(payout_type, payout_key) THEN
    RAISE EXCEPTION 'invalid payout details';
  END IF;

  SELECT status INTO existing_status
  FROM public.partner_requests WHERE user_id = uid;
  IF existing_status = 'approved' THEN
    RAISE EXCEPTION 'approved partner identity cannot be changed here';
  END IF;

  -- Keep the legal name consistent in the accountant dashboard, payment identity and profile.
  UPDATE public.profiles
  SET full_name = trim(_full_name)
  WHERE user_id = uid;

  INSERT INTO public.partner_requests(
    user_id, full_name, tax_id, crc_number, pix_type, pix_key, status, email, updated_at
  )
  VALUES (
    uid,
    trim(_full_name),
    regexp_replace(_tax_id, '[^0-9]', '', 'g'),
    upper(trim(_crc_number)),
    payout_type,
    payout_key,
    'pending_approval',
    (SELECT lower(email) FROM auth.users WHERE id = uid),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    tax_id = EXCLUDED.tax_id,
    crc_number = EXCLUDED.crc_number,
    pix_type = EXCLUDED.pix_type,
    pix_key = EXCLUDED.pix_key,
    email = EXCLUDED.email,
    status = 'pending_approval',
    updated_at = now();
END
$function$;

CREATE OR REPLACE FUNCTION public.update_partner_payout(_pix_type text, _pix_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  partner_status text;
  payout_type text := NULLIF(lower(trim(_pix_type)), '');
  payout_key text := NULLIF(trim(_pix_key), '');
  confirmed_referrals integer := 0;
  payout_rate integer := 20;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF (payout_type IS NULL) <> (payout_key IS NULL) THEN
    RAISE EXCEPTION 'PIX type and key must be provided together';
  END IF;
  IF payout_type IS NOT NULL AND NOT public.is_valid_pix_key(payout_type, payout_key) THEN
    RAISE EXCEPTION 'invalid payout details';
  END IF;

  UPDATE public.partner_requests
  SET pix_type = payout_type, pix_key = payout_key, updated_at = now()
  WHERE user_id = uid
  RETURNING status INTO partner_status;
  IF NOT FOUND THEN RAISE EXCEPTION 'partner request not found'; END IF;

  IF partner_status = 'approved' AND payout_type IS NOT NULL AND payout_key IS NOT NULL
     AND public.is_valid_pix_key(payout_type, payout_key) THEN
    SELECT count(DISTINCT s.user_id)::integer INTO confirmed_referrals
    FROM public.subscriptions s
    WHERE s.affiliate_partner_id = uid AND s.paid_at IS NOT NULL;
    payout_rate := CASE WHEN confirmed_referrals <= 5 THEN 20 WHEN confirmed_referrals <= 15 THEN 25 ELSE 30 END;

    UPDATE public.coupons
    SET is_active = true, commission_percent = payout_rate, updated_at = now()
    WHERE partner_id = uid;

    IF NOT FOUND THEN
      INSERT INTO public.coupons(partner_id, code, discount_percent, commission_percent, is_active, updated_at)
      VALUES (uid, 'CC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), 10, payout_rate, true, now());
    END IF;
  ELSE
    UPDATE public.coupons SET is_active = false, updated_at = now() WHERE partner_id = uid;
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_partner_status(_partner_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  partner_pix_type text;
  partner_pix_key text;
  confirmed_referrals integer := 0;
  payout_rate integer := 20;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin access required';
  END IF;
  IF _status NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'invalid status'; END IF;

  UPDATE public.partner_requests
  SET status = _status, updated_at = now()
  WHERE user_id = _partner_id
  RETURNING pix_type, pix_key INTO partner_pix_type, partner_pix_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'partner not found'; END IF;

  IF _status = 'approved' AND public.is_valid_pix_key(partner_pix_type, partner_pix_key) THEN
    SELECT count(DISTINCT s.user_id)::integer INTO confirmed_referrals
    FROM public.subscriptions s
    WHERE s.affiliate_partner_id = _partner_id AND s.paid_at IS NOT NULL;
    payout_rate := CASE WHEN confirmed_referrals <= 5 THEN 20 WHEN confirmed_referrals <= 15 THEN 25 ELSE 30 END;

    UPDATE public.coupons
    SET is_active = true, commission_percent = payout_rate, updated_at = now()
    WHERE partner_id = _partner_id;

    IF NOT FOUND THEN
      INSERT INTO public.coupons(partner_id, code, discount_percent, commission_percent, is_active, updated_at)
      VALUES (_partner_id, 'CC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), 10, payout_rate, true, now());
    END IF;
  ELSE
    UPDATE public.coupons SET is_active = false, updated_at = now() WHERE partner_id = _partner_id;
  END IF;
END
$function$;

-- Update the active coupon tier from distinct referred customers whose payment was confirmed.
-- Historical confirmed payers stay counted even if a subscription later cancels.
CREATE OR REPLACE FUNCTION public.sync_partner_coupon_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  affected_partner uuid;
  confirmed_clients integer := 0;
  payout_rate integer := 20;
  payout_is_ready boolean := false;
BEGIN
  FOR affected_partner IN
    SELECT affected.partner_id
    FROM (
      SELECT CASE WHEN TG_OP = 'UPDATE' THEN OLD.affiliate_partner_id ELSE NULL::uuid END AS partner_id
      UNION
      SELECT NEW.affiliate_partner_id AS partner_id
    ) affected
    WHERE affected.partner_id IS NOT NULL
  LOOP
    SELECT count(DISTINCT s.user_id)::integer INTO confirmed_clients
    FROM public.subscriptions s
    WHERE s.affiliate_partner_id = affected_partner
      AND s.paid_at IS NOT NULL;

    payout_rate := CASE
      WHEN confirmed_clients <= 5 THEN 20
      WHEN confirmed_clients <= 15 THEN 25
      ELSE 30
    END;

    SELECT
      pr.status = 'approved'
      AND public.is_valid_pix_key(pr.pix_type, pr.pix_key)
    INTO payout_is_ready
    FROM public.partner_requests pr
    WHERE pr.user_id = affected_partner;

    UPDATE public.coupons c
    SET commission_percent = payout_rate,
        is_active = COALESCE(payout_is_ready, false),
        updated_at = now()
    WHERE c.partner_id = affected_partner;
  END LOOP;

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS subscriptions_sync_partner_coupon_rate ON public.subscriptions;
CREATE TRIGGER subscriptions_sync_partner_coupon_rate
AFTER INSERT OR UPDATE OF status, paid_at, affiliate_partner_id
ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_coupon_rate();

-- Maintain explicit customer consent for accountants who want access to clients' financial ledgers.
CREATE TABLE IF NOT EXISTS public.accountant_access (
  client_user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partner_requests(user_id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accountant_access_partner_idx
  ON public.accountant_access(partner_id, client_user_id);
GRANT SELECT ON public.accountant_access TO authenticated;
ALTER TABLE public.accountant_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "accountant_access_read_own" ON public.accountant_access;
CREATE POLICY "accountant_access_read_own" ON public.accountant_access
FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = client_user_id OR (SELECT auth.uid()) = partner_id);

CREATE OR REPLACE FUNCTION public.partner_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  result jsonb;
BEGIN
  IF uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.partner_requests
    WHERE user_id = uid AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'approved partner access required';
  END IF;

  SELECT jsonb_build_object(
    'coupon', (
      SELECT jsonb_build_object(
        'code', c.code,
        'discount_percent', c.discount_percent,
        'commission_percent', c.commission_percent
      )
      FROM public.coupons c
      WHERE c.partner_id = uid AND c.is_active
      LIMIT 1
    ),
    'totals', jsonb_build_object(
      'commission_cents', COALESCE((SELECT sum(c.amount_cents) FROM public.commissions c WHERE c.partner_id = uid), 0),
      'pending_cents', COALESCE((SELECT sum(c.amount_cents) FROM public.commissions c WHERE c.partner_id = uid AND c.status IN ('pending','available')), 0),
      'paid_cents', COALESCE((SELECT sum(c.amount_cents) FROM public.commissions c WHERE c.partner_id = uid AND c.status = 'paid'), 0),
      'referred_clients', (
        SELECT count(DISTINCT s.user_id) FROM public.subscriptions s
        WHERE s.affiliate_partner_id = uid AND s.paid_at IS NOT NULL
      ),
      'active_clients', (
        SELECT count(*) FROM public.subscriptions s
        WHERE s.affiliate_partner_id = uid AND s.status = 'active' AND s.paid_at IS NOT NULL
      )
    ),
    'referrals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', s.user_id,
        'client_name', COALESCE(NULLIF(trim(p.full_name), ''), NULLIF(trim(p.business_name), ''), 'Cliente'),
        'plan', COALESCE(s.plan::text, ''),
        'status', s.status,
        'created_at', s.created_at,
        'paid_at', s.paid_at
      ) ORDER BY s.paid_at DESC)
      FROM public.subscriptions s
      JOIN public.profiles p ON p.user_id = s.user_id
      WHERE s.affiliate_partner_id = uid
        AND s.paid_at IS NOT NULL
    ), '[]'::jsonb),
    'commissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'client_name', c.client_name, 'amount_cents', c.amount_cents,
        'status', c.status, 'created_at', c.created_at, 'paid_at', c.paid_at,
        'receipt_url', c.receipt_url
      ) ORDER BY c.created_at DESC)
      FROM public.commissions c
      WHERE c.partner_id = uid
    ), '[]'::jsonb),
    'clients', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'client_name', p.business_name,
        'plan', s.plan::text,
        'status', s.status,
        'entry_count', COALESCE(x.entry_count, 0),
        'income_cents', COALESCE(x.income_cents, 0),
        'expense_cents', COALESCE(x.expense_cents, 0),
        'shared_at', aa.granted_at,
        'entries', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'description', e.description, 'type', e.type, 'amount_cents', e.amount_cents,
            'due_date', e.due_date, 'status', e.status, 'paid_at', e.paid_at
          ) ORDER BY e.due_date)
          FROM public.entries e WHERE e.user_id = aa.client_user_id
        ), '[]'::jsonb)
      ) ORDER BY p.business_name)
      FROM public.accountant_access aa
      JOIN public.subscriptions s ON s.user_id = aa.client_user_id AND s.affiliate_partner_id = uid
      JOIN public.profiles p ON p.user_id = aa.client_user_id
      LEFT JOIN LATERAL (
        SELECT count(*) AS entry_count,
          COALESCE(sum(amount_cents) FILTER (WHERE type = 'income'), 0) AS income_cents,
          COALESCE(sum(amount_cents) FILTER (WHERE type = 'expense'), 0) AS expense_cents
        FROM public.entries e WHERE e.user_id = aa.client_user_id
      ) x ON true
      WHERE aa.partner_id = uid
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_partner_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin access required';
  END IF;

  SELECT jsonb_build_object(
    'partners', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', pr.user_id,
        'name', pr.full_name,
        'email', COALESCE(pr.email, au.email),
        'status', pr.status,
        'tax_id', pr.tax_id,
        'crc_number', pr.crc_number,
        'pix_type', pr.pix_type,
        'pix_key', pr.pix_key,
        'coupon_code', cp.code,
        'commission_percent', cp.commission_percent,
        'referrals', (
          SELECT count(DISTINCT s.user_id) FROM public.subscriptions s
          WHERE s.affiliate_partner_id = pr.user_id AND s.paid_at IS NOT NULL
        )
      ) ORDER BY pr.created_at DESC)
      FROM public.partner_requests pr
      LEFT JOIN auth.users au ON au.id = pr.user_id
      LEFT JOIN public.coupons cp ON cp.partner_id = pr.user_id
    ), '[]'::jsonb),
    'commissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'partner_id', c.partner_id,
        'partner_name', pr.full_name,
        'client_name', c.client_name,
        'amount', (c.amount_cents::numeric / 100),
        'status', c.status,
        'created_at', c.created_at,
        'paid_at', c.paid_at
      ) ORDER BY c.created_at DESC)
      FROM public.commissions c
      LEFT JOIN public.partner_requests pr ON pr.user_id = c.partner_id
    ), '[]'::jsonb),
    'clients', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', s.user_id,
        'partner_id', s.affiliate_partner_id,
        'partner_name', pr.full_name,
        'client_name', COALESCE(NULLIF(trim(p.full_name), ''), NULLIF(trim(p.business_name), ''), 'Cliente'),
        'client_email', COALESCE(p.email, au.email),
        'subscription_status', s.status,
        'created_at', s.created_at,
        'paid_at', s.paid_at
      ) ORDER BY s.paid_at DESC)
      FROM public.subscriptions s
      JOIN public.partner_requests pr ON pr.user_id = s.affiliate_partner_id
      JOIN public.profiles p ON p.user_id = s.user_id
      LEFT JOIN auth.users au ON au.id = s.user_id
      WHERE s.affiliate_partner_id IS NOT NULL
        AND s.paid_at IS NOT NULL
    ), '[]'::jsonb),
    'total_commissions', (SELECT count(*) FROM public.commissions),
    'total_commission_amount', COALESCE((SELECT sum(c.amount_cents)::numeric / 100 FROM public.commissions c), 0),
    'total_clients', (SELECT count(DISTINCT s.user_id) FROM public.subscriptions s WHERE s.affiliate_partner_id IS NOT NULL AND s.paid_at IS NOT NULL)
  ) INTO result;

  RETURN result;
END
$function$;

REVOKE ALL ON FUNCTION public.partner_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_partner_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_partner_overview() TO authenticated;

-- Only the owner of the document set and genuine administrators may read it.
DROP POLICY IF EXISTS "Partner applicants can read their own documents" ON public.partner_application_documents;
CREATE POLICY "Partner applicants can read their own documents"
ON public.partner_application_documents FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Administrators can review partner documents" ON public.partner_application_documents;
CREATE POLICY "Administrators can review partner documents"
ON public.partner_application_documents FOR SELECT TO authenticated
USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Partner applicants can submit their own documents" ON public.partner_application_documents;
CREATE POLICY "Partner applicants can submit their own documents"
ON public.partner_application_documents FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND crc_document_path LIKE (SELECT auth.uid())::text || '/crc-%'
  AND identity_document_path LIKE (SELECT auth.uid())::text || '/identidade-%'
  AND address_document_path LIKE (SELECT auth.uid())::text || '/endereco-%'
  AND lower(crc_document_path) ~ '\.(pdf|csv|xls|xlsx)$'
  AND lower(identity_document_path) ~ '\.(pdf|csv|xls|xlsx)$'
  AND lower(address_document_path) ~ '\.(pdf|csv|xls|xlsx)$'
  AND NOT EXISTS (
    SELECT 1 FROM public.partner_requests pr
    WHERE pr.user_id = (SELECT auth.uid()) AND pr.status <> 'rejected'
  )
);

DROP POLICY IF EXISTS "Partner applicants can update their own documents" ON public.partner_application_documents;
CREATE POLICY "Partner applicants can update their own documents"
ON public.partner_application_documents FOR UPDATE TO authenticated
USING (
  (SELECT auth.uid()) = user_id
  AND EXISTS (
    SELECT 1 FROM public.partner_requests pr
    WHERE pr.user_id = (SELECT auth.uid()) AND pr.status = 'rejected'
  )
)
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND crc_document_path LIKE (SELECT auth.uid())::text || '/crc-%'
  AND identity_document_path LIKE (SELECT auth.uid())::text || '/identidade-%'
  AND address_document_path LIKE (SELECT auth.uid())::text || '/endereco-%'
  AND lower(crc_document_path) ~ '\.(pdf|csv|xls|xlsx)$'
  AND lower(identity_document_path) ~ '\.(pdf|csv|xls|xlsx)$'
  AND lower(address_document_path) ~ '\.(pdf|csv|xls|xlsx)$'
  AND EXISTS (
    SELECT 1 FROM public.partner_requests pr
    WHERE pr.user_id = (SELECT auth.uid()) AND pr.status = 'rejected'
  )
);

UPDATE storage.buckets
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ]
WHERE id = 'partner-application-documents';

DROP POLICY IF EXISTS "Applicants upload their own partner documents" ON storage.objects;
CREATE POLICY "Applicants upload their own partner documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'partner-application-documents'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND (
    (lower(name) LIKE '%.pdf' AND COALESCE(metadata->>'mimetype', '') = 'application/pdf')
    OR (lower(name) LIKE '%.csv' AND COALESCE(metadata->>'mimetype', '') = 'text/csv')
    OR (lower(name) LIKE '%.xls' AND COALESCE(metadata->>'mimetype', '') = 'application/vnd.ms-excel')
    OR (lower(name) LIKE '%.xlsx' AND COALESCE(metadata->>'mimetype', '') = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.partner_requests pr
    WHERE pr.user_id = (SELECT auth.uid()) AND pr.status <> 'rejected'
  )
);

DROP POLICY IF EXISTS "Applicants and administrators read partner documents" ON storage.objects;
CREATE POLICY "Applicants and administrators read partner documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'partner-application-documents'
  AND (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
  )
);

-- Prevent anonymous access to sensitive RPCs; authorization inside SECURITY DEFINER functions is mandatory.
REVOKE ALL ON FUNCTION public.sync_partner_coupon_rate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_valid_cpf_cnpj(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_valid_pix_key(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_partner_request(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_partner_payout(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_partner_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_cpf_cnpj(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_partner_request(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_partner_payout(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_partner_status(uuid, text) TO authenticated;
