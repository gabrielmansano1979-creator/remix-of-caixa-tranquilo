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
  ADD COLUMN IF NOT EXISTS amount_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_id uuid,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_url text,
  ADD COLUMN IF NOT EXISTS payment_id text;

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

CREATE UNIQUE INDEX IF NOT EXISTS commissions_payment_id_unique
  ON public.commissions(payment_id)
  WHERE payment_id IS NOT NULL;

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
  IF length(trim(_full_name)) NOT BETWEEN 2 AND 160
     OR _tax_id IS NULL
     OR NOT public.is_valid_cpf_cnpj(_tax_id)
     OR upper(trim(_crc_number)) !~ '^[A-Z]{2}-[0-9]{6}/[A-Z]$'
  THEN RAISE EXCEPTION 'invalid partner identity'; END IF;

  IF (payout_type IS NULL) <> (payout_key IS NULL) THEN
    RAISE EXCEPTION 'PIX type and key must be provided together';
  END IF;
  IF payout_type IS NOT NULL AND (
    payout_type NOT IN ('cpf', 'cnpj', 'email', 'phone', 'random')
    OR length(payout_key) NOT BETWEEN 3 AND 180
  ) THEN RAISE EXCEPTION 'invalid payout details'; END IF;

  SELECT status INTO existing_status
  FROM public.partner_requests WHERE user_id = uid;
  IF existing_status = 'approved' THEN
    RAISE EXCEPTION 'approved partner identity cannot be changed here';
  END IF;

  INSERT INTO public.partner_requests(
    user_id, full_name, tax_id, crc_number, pix_type, pix_key, status, email, updated_at
  )
  VALUES (
    uid,
    trim(_full_name),
    regexp_replace(_tax_id, '\D', '', 'g'),
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
  IF payout_type IS NOT NULL AND (
    payout_type NOT IN ('cpf', 'cnpj', 'email', 'phone', 'random')
    OR length(payout_key) NOT BETWEEN 3 AND 180
  ) THEN RAISE EXCEPTION 'invalid payout details'; END IF;

  UPDATE public.partner_requests
  SET pix_type = payout_type, pix_key = payout_key, updated_at = now()
  WHERE user_id = uid
  RETURNING status INTO partner_status;
  IF NOT FOUND THEN RAISE EXCEPTION 'partner request not found'; END IF;

  IF partner_status = 'approved' AND payout_type IS NOT NULL AND payout_key IS NOT NULL THEN
    SELECT count(*)::integer INTO confirmed_referrals
    FROM public.subscriptions s
    WHERE s.affiliate_partner_id = uid AND s.status = 'active' AND s.paid_at IS NOT NULL;
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

  IF _status = 'approved' AND NULLIF(trim(partner_pix_type), '') IS NOT NULL
     AND NULLIF(trim(partner_pix_key), '') IS NOT NULL THEN
    SELECT count(*)::integer INTO confirmed_referrals
    FROM public.subscriptions s
    WHERE s.affiliate_partner_id = _partner_id AND s.status = 'active' AND s.paid_at IS NOT NULL;
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
  AND lower(name) ~ '\.(pdf|csv|xls|xlsx)$'
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
REVOKE ALL ON FUNCTION public.is_valid_cpf_cnpj(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_partner_request(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_partner_payout(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_partner_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_cpf_cnpj(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_partner_request(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_partner_payout(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_partner_status(uuid, text) TO authenticated;
