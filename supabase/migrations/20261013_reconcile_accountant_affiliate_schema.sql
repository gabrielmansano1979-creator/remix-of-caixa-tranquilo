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

