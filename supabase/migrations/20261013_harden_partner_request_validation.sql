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
