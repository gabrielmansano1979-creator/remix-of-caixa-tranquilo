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
