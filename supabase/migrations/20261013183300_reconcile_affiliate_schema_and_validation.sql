-- Consolidated source: supabase/migrations/20261013_reconcile_accountant_affiliate_schema.sql
-- Reconcile the deployed affiliate/accountant schema with the application contract.
-- Additive data changes; existing financial data is preserved.
ALTER TABLE public.partner_requests
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS crc_number text,
  ADD COLUMN IF NOT EXISTS pix_type text,
  ADD COLUMN IF NOT EXISTS pix_key text;

ALTER TABLE public.partner_requests
  ALTER COLUMN status SET DEFAULT 'pending_approval';

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS amount_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_url text;

ALTER TABLE public.commissions
  DROP CONSTRAINT IF EXISTS commissions_amount_cents_check;
ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_amount_cents_check CHECK (amount_cents >= 0);

-- Application affiliate identifiers are auth user IDs, not partner_requests.id.
-- The affected affiliate tables currently have no linked rows, verified before this migration.
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_partner_id_fkey;
ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES public.partner_requests(user_id) ON DELETE CASCADE;

ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_partner_id_fkey;
ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES public.partner_requests(user_id) ON DELETE CASCADE;

ALTER TABLE public.accountant_access DROP CONSTRAINT IF EXISTS accountant_access_partner_id_fkey;
ALTER TABLE public.accountant_access
  ADD CONSTRAINT accountant_access_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES public.partner_requests(user_id) ON DELETE CASCADE;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_affiliate_partner_id_fkey;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_affiliate_partner_id_fkey
  FOREIGN KEY (affiliate_partner_id) REFERENCES public.partner_requests(user_id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS coupons_partner_id_unique
  ON public.coupons(partner_id);
CREATE UNIQUE INDEX IF NOT EXISTS commissions_payment_id_unique
  ON public.commissions(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscriptions_affiliate_partner_idx
  ON public.subscriptions(affiliate_partner_id);
CREATE INDEX IF NOT EXISTS accountant_access_partner_idx
  ON public.accountant_access(partner_id, client_user_id);

CREATE OR REPLACE FUNCTION public.is_valid_cpf_cnpj(p_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $function$
DECLARE
  digits text := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
  total integer;
  remainder integer;
  expected integer;
  weights integer[];
  i integer;
BEGIN
  IF digits ~ '^(.)\1+$' THEN RETURN false; END IF;

  IF length(digits) = 11 THEN
    total := 0;
    FOR i IN 1..9 LOOP
      total := total + substring(digits FROM i FOR 1)::integer * (11 - i);
    END LOOP;
    remainder := (total * 10) % 11;
    expected := CASE WHEN remainder = 10 THEN 0 ELSE remainder END;
    IF expected <> substring(digits FROM 10 FOR 1)::integer THEN RETURN false; END IF;

    total := 0;
    FOR i IN 1..10 LOOP
      total := total + substring(digits FROM i FOR 1)::integer * (12 - i);
    END LOOP;
    remainder := (total * 10) % 11;
    expected := CASE WHEN remainder = 10 THEN 0 ELSE remainder END;
    RETURN expected = substring(digits FROM 11 FOR 1)::integer;
  ELSIF length(digits) = 14 THEN
    weights := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
    total := 0;
    FOR i IN 1..12 LOOP
      total := total + substring(digits FROM i FOR 1)::integer * weights[i];
    END LOOP;
    remainder := total % 11;
    expected := CASE WHEN remainder < 2 THEN 0 ELSE 11 - remainder END;
    IF expected <> substring(digits FROM 13 FOR 1)::integer THEN RETURN false; END IF;

    weights := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
    total := 0;
    FOR i IN 1..13 LOOP
      total := total + substring(digits FROM i FOR 1)::integer * weights[i];
    END LOOP;
    remainder := total % 11;
    expected := CASE WHEN remainder < 2 THEN 0 ELSE 11 - remainder END;
    RETURN expected = substring(digits FROM 14 FOR 1)::integer;
  END IF;

  RETURN false;
END
$function$;

REVOKE ALL ON FUNCTION public.is_valid_cpf_cnpj(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_cpf_cnpj(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_partner_request(
  _full_name text,
  _tax_id text,
  _crc_number text,
  _pix_type text,
  _pix_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  existing_status text;
  clean_tax_id text := regexp_replace(coalesce(_tax_id, ''), '[^0-9]', '', 'g');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  IF length(trim(coalesce(_full_name, ''))) NOT BETWEEN 2 AND 160
    OR NOT public.is_valid_cpf_cnpj(clean_tax_id)
    OR upper(coalesce(_crc_number, '')) !~ '^[A-Z]{2}-[0-9]{6}/[A-Z]$'
    OR _pix_type NOT IN ('cpf', 'cnpj', 'email', 'phone', 'random')
    OR length(trim(coalesce(_pix_key, ''))) NOT BETWEEN 3 AND 180
  THEN RAISE EXCEPTION 'invalid partner request'; END IF;

  SELECT status INTO existing_status
  FROM public.partner_requests WHERE user_id = uid;
  IF existing_status = 'approved' THEN
    RAISE EXCEPTION 'approved partner details cannot be changed here';
  END IF;

  INSERT INTO public.partner_requests(user_id, full_name, tax_id, crc_number, pix_type, pix_key, status, email)
  VALUES (
    uid, trim(_full_name), clean_tax_id,
    upper(_crc_number), _pix_type, trim(_pix_key), 'pending_approval',
    (SELECT lower(email) FROM auth.users WHERE id = uid)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    tax_id = EXCLUDED.tax_id,
    crc_number = EXCLUDED.crc_number,
    pix_type = EXCLUDED.pix_type,
    pix_key = EXCLUDED.pix_key,
    email = EXCLUDED.email,
    status = 'pending_approval';
END
$function$;

REVOKE ALL ON FUNCTION public.submit_partner_request(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_partner_request(text, text, text, text, text) TO authenticated;



-- Consolidated source: supabase/migrations/20261013_subscription_and_commission_constraints.sql
-- Restore the uniqueness assumptions used by subscription upserts and reporting.
-- Duplicate subscription user IDs were checked before adding this index.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_unique
  ON public.subscriptions(user_id);

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS subscription_id uuid;

-- The subscription table is one row per user; the unique index above makes this FK valid.
ALTER TABLE public.commissions
  DROP CONSTRAINT IF EXISTS commissions_subscription_id_fkey;
ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_subscription_id_fkey
  FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(user_id) ON DELETE SET NULL;

-- commissions_payment_id already has a unique constraint; remove the redundant index
-- created by the earlier schema reconciliation.
DROP INDEX IF EXISTS public.commissions_payment_id_unique;


-- Consolidated source: supabase/migrations/20261013_fix_admin_affiliate_reporting.sql
-- Align the admin overview payload with src/routes/admin/index.tsx.
CREATE OR REPLACE FUNCTION public.admin_partner_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin access required';
  END IF;

  SELECT jsonb_build_object(
    'partners', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', pr.user_id,
        'name', pr.full_name,
        'tax_id', pr.tax_id,
        'crc_number', pr.crc_number,
        'email', COALESCE(pr.email, au.email),
        'pix_type', pr.pix_type,
        'pix_key', pr.pix_key,
        'status', pr.status,
        'coupon_code', cp.code,
        'commission_percent', cp.commission_percent,
        'referrals', (
          SELECT count(*) FROM public.subscriptions s
          WHERE s.affiliate_partner_id = pr.user_id
        ),
        'gross_commission_cents', COALESCE((
          SELECT sum(c.amount_cents) FROM public.commissions c
          WHERE c.partner_id = pr.user_id
        ), 0)
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
        'amount', COALESCE(c.amount_cents, 0)::numeric / 100,
        'amount_cents', COALESCE(c.amount_cents, 0),
        'status', c.status,
        'created_at', c.created_at,
        'paid_at', c.paid_at,
        'pix_type', pr.pix_type,
        'pix_key', pr.pix_key
      ) ORDER BY c.created_at DESC)
      FROM public.commissions c
      JOIN public.partner_requests pr ON pr.user_id = c.partner_id
    ), '[]'::jsonb),
    'clients', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', s.user_id,
        'partner_id', s.affiliate_partner_id,
        'partner_name', pr.full_name,
        'client_name', p.business_name,
        'client_email', au.email,
        'subscription_status', s.status,
        'created_at', s.created_at,
        'paid_at', s.paid_at
      ) ORDER BY s.created_at DESC)
      FROM public.subscriptions s
      JOIN public.partner_requests pr ON pr.user_id = s.affiliate_partner_id
      LEFT JOIN public.profiles p ON p.user_id = s.user_id
      LEFT JOIN auth.users au ON au.id = s.user_id
      WHERE s.affiliate_partner_id IS NOT NULL
    ), '[]'::jsonb),
    'total_commissions', (SELECT count(*) FROM public.commissions),
    'total_commission_amount', COALESCE((
      SELECT sum(c.amount_cents)::numeric / 100 FROM public.commissions c
    ), 0),
    'total_clients', (
      SELECT count(*) FROM public.subscriptions s
      WHERE s.affiliate_partner_id IS NOT NULL
    )
  ) INTO result;

  RETURN result;
END
$function$;

REVOKE ALL ON FUNCTION public.admin_partner_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_partner_overview() TO authenticated;


-- Consolidated source: supabase/migrations/20261013_commission_legacy_amount_default.sql
-- The deployed table retains a legacy required amount column while application code
-- uses amount_cents. Default the legacy field so new commission inserts remain compatible.
ALTER TABLE public.commissions
  ALTER COLUMN amount SET DEFAULT 0;


-- Consolidated source: supabase/migrations/20261013_harden_partner_request_validation.sql
-- Ensure NULL values cannot bypass the server-side Pix key type allowlist.
CREATE OR REPLACE FUNCTION public.submit_partner_request(
  _full_name text, _tax_id text, _crc_number text, _pix_type text, _pix_key text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  uid uuid := auth.uid();
  existing_status text;
  clean_tax_id text := regexp_replace(coalesce(_tax_id, ''), '[^0-9]', '', 'g');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF length(trim(coalesce(_full_name, ''))) NOT BETWEEN 2 AND 160
    OR NOT public.is_valid_cpf_cnpj(clean_tax_id)
    OR upper(coalesce(_crc_number, '')) !~ '^[A-Z]{2}-[0-9]{6}/[A-Z]$'
    OR coalesce(_pix_type, '') NOT IN ('cpf', 'cnpj', 'email', 'phone', 'random')
    OR length(trim(coalesce(_pix_key, ''))) NOT BETWEEN 3 AND 180
  THEN RAISE EXCEPTION 'invalid partner request'; END IF;

  SELECT status INTO existing_status FROM public.partner_requests WHERE user_id = uid;
  IF existing_status = 'approved' THEN RAISE EXCEPTION 'approved partner details cannot be changed here'; END IF;

  INSERT INTO public.partner_requests(user_id, full_name, tax_id, crc_number, pix_type, pix_key, status, email)
  VALUES (uid, trim(_full_name), clean_tax_id, upper(_crc_number), _pix_type, trim(_pix_key), 'pending_approval',
    (SELECT lower(email) FROM auth.users WHERE id = uid))
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name, tax_id = EXCLUDED.tax_id, crc_number = EXCLUDED.crc_number,
    pix_type = EXCLUDED.pix_type, pix_key = EXCLUDED.pix_key, email = EXCLUDED.email, status = 'pending_approval';
END $function$;

REVOKE ALL ON FUNCTION public.submit_partner_request(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_partner_request(text, text, text, text, text) TO authenticated;


-- Consolidated source: supabase/migrations/20261013_support_alphanumeric_cnpj.sql
-- Validate both legacy numeric CNPJs and the Receita Federal alphanumeric CNPJ format.
CREATE OR REPLACE FUNCTION public.is_valid_cpf_cnpj(p_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $function$
DECLARE
  normalized text := upper(regexp_replace(coalesce(p_value, ''), '[^A-Z0-9]', '', 'g'));
  total integer;
  remainder integer;
  expected integer;
  weights integer[];
  i integer;
BEGIN
  IF normalized ~ '^([A-Z0-9])\1+$' THEN RETURN false; END IF;

  IF normalized ~ '^\d{11}$' THEN
    total := 0;
    FOR i IN 1..9 LOOP
      total := total + substring(normalized FROM i FOR 1)::integer * (11 - i);
    END LOOP;
    remainder := (total * 10) % 11;
    expected := CASE WHEN remainder = 10 THEN 0 ELSE remainder END;
    IF expected <> substring(normalized FROM 10 FOR 1)::integer THEN RETURN false; END IF;

    total := 0;
    FOR i IN 1..10 LOOP
      total := total + substring(normalized FROM i FOR 1)::integer * (12 - i);
    END LOOP;
    remainder := (total * 10) % 11;
    expected := CASE WHEN remainder = 10 THEN 0 ELSE remainder END;
    RETURN expected = substring(normalized FROM 11 FOR 1)::integer;
  ELSIF normalized ~ '^[A-Z0-9]{12}\d{2}$' THEN
    weights := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
    total := 0;
    FOR i IN 1..12 LOOP
      total := total + (ascii(substring(normalized FROM i FOR 1)) - 48) * weights[i];
    END LOOP;
    remainder := total % 11;
    expected := CASE WHEN remainder < 2 THEN 0 ELSE 11 - remainder END;
    IF expected <> substring(normalized FROM 13 FOR 1)::integer THEN RETURN false; END IF;

    weights := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
    total := 0;
    FOR i IN 1..13 LOOP
      total := total + (ascii(substring(normalized FROM i FOR 1)) - 48) * weights[i];
    END LOOP;
    remainder := total % 11;
    expected := CASE WHEN remainder < 2 THEN 0 ELSE 11 - remainder END;
    RETURN expected = substring(normalized FROM 14 FOR 1)::integer;
  END IF;

  RETURN false;
END
$function$;

CREATE OR REPLACE FUNCTION public.submit_partner_request(
  _full_name text, _tax_id text, _crc_number text, _pix_type text, _pix_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  existing_status text;
  clean_tax_id text := upper(regexp_replace(coalesce(_tax_id, ''), '[^A-Z0-9]', '', 'g'));
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF length(trim(coalesce(_full_name, ''))) NOT BETWEEN 2 AND 160
    OR NOT public.is_valid_cpf_cnpj(clean_tax_id)
    OR upper(coalesce(_crc_number, '')) !~ '^[A-Z]{2}-[0-9]{6}/[A-Z]$'
    OR coalesce(_pix_type, '') NOT IN ('cpf', 'cnpj', 'email', 'phone', 'random')
    OR length(trim(coalesce(_pix_key, ''))) NOT BETWEEN 3 AND 180
  THEN RAISE EXCEPTION 'invalid partner request'; END IF;

  SELECT status INTO existing_status FROM public.partner_requests WHERE user_id = uid;
  IF existing_status = 'approved' THEN RAISE EXCEPTION 'approved partner details cannot be changed here'; END IF;

  INSERT INTO public.partner_requests(user_id, full_name, tax_id, crc_number, pix_type, pix_key, status, email)
  VALUES (uid, trim(_full_name), clean_tax_id, upper(_crc_number), _pix_type, trim(_pix_key), 'pending_approval',
    (SELECT lower(email) FROM auth.users WHERE id = uid))
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name, tax_id = EXCLUDED.tax_id, crc_number = EXCLUDED.crc_number,
    pix_type = EXCLUDED.pix_type, pix_key = EXCLUDED.pix_key, email = EXCLUDED.email, status = 'pending_approval';
END
$function$;

REVOKE ALL ON FUNCTION public.is_valid_cpf_cnpj(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_cpf_cnpj(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_partner_request(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_partner_request(text, text, text, text, text) TO authenticated;


-- Final application contract: optional PIX pair and full CRC formats accepted by the UI.
CREATE OR REPLACE FUNCTION public.submit_partner_request(
  _full_name text, _tax_id text, _crc_number text, _pix_type text, _pix_key text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  uid uuid := auth.uid();
  existing_status text;
  clean_tax_id text := upper(regexp_replace(coalesce(_tax_id, ''), '[^A-Z0-9]', '', 'g'));
  clean_pix_type text := nullif(trim(coalesce(_pix_type, '')), '');
  clean_pix_key text := nullif(trim(coalesce(_pix_key, '')), '');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF length(trim(coalesce(_full_name, ''))) NOT BETWEEN 2 AND 160
    OR NOT public.is_valid_cpf_cnpj(clean_tax_id)
    OR upper(coalesce(_crc_number, '')) !~ '^[A-Z]{2}-[0-9]{6}/[OP]-[0-9]([[:space:]]+[TS]-[A-Z]{2})?$'
    OR NOT (
      (clean_pix_type IS NULL AND clean_pix_key IS NULL)
      OR (clean_pix_type IN ('cpf', 'cnpj', 'email', 'phone', 'random')
          AND length(clean_pix_key) BETWEEN 3 AND 180)
    )
  THEN RAISE EXCEPTION 'invalid partner request'; END IF;
  SELECT status INTO existing_status FROM public.partner_requests WHERE user_id = uid;
  IF existing_status = 'approved' THEN RAISE EXCEPTION 'approved partner details cannot be changed here'; END IF;
  INSERT INTO public.partner_requests(user_id, full_name, tax_id, crc_number, pix_type, pix_key, status, email)
  VALUES (uid, trim(_full_name), clean_tax_id, upper(_crc_number), clean_pix_type, clean_pix_key,
    'pending_approval', (SELECT lower(email) FROM auth.users WHERE id = uid))
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name, tax_id = EXCLUDED.tax_id, crc_number = EXCLUDED.crc_number,
    pix_type = EXCLUDED.pix_type, pix_key = EXCLUDED.pix_key, email = EXCLUDED.email,
    status = 'pending_approval';
END $function$;
REVOKE ALL ON FUNCTION public.submit_partner_request(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_partner_request(text, text, text, text, text) TO authenticated;
