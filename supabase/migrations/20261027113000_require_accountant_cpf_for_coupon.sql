-- Require and validate the accountant's CPF so a coupon cannot be used by a second account
-- belonging to the same person. CRC and professional documents remain optional.
DROP FUNCTION IF EXISTS public.register_accountant_access(text);

CREATE OR REPLACE FUNCTION public.register_accountant_access(_full_name text, _tax_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  account_email text;
  display_name text;
  cpf_digits text;
  partner_record_id uuid;
  coupon_code text;
  checksum_sum integer;
  check_digit integer;
  i integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT email INTO account_email FROM auth.users WHERE id = uid;
  IF account_email IS NULL THEN
    RAISE EXCEPTION 'authenticated account email not found';
  END IF;

  cpf_digits := regexp_replace(coalesce(_tax_id, ''), '[^0-9]', '', 'g');
  IF length(cpf_digits) <> 11 OR cpf_digits ~ '^([0-9])\1{10}$' THEN
    RAISE EXCEPTION 'Informe um CPF válido do titular do cupom.';
  END IF;

  checksum_sum := 0;
  FOR i IN 1..9 LOOP
    checksum_sum := checksum_sum + substring(cpf_digits FROM i FOR 1)::integer * (11 - i);
  END LOOP;
  check_digit := (checksum_sum * 10) % 11;
  IF check_digit = 10 THEN check_digit := 0; END IF;
  IF check_digit <> substring(cpf_digits FROM 10 FOR 1)::integer THEN
    RAISE EXCEPTION 'Informe um CPF válido do titular do cupom.';
  END IF;

  checksum_sum := 0;
  FOR i IN 1..10 LOOP
    checksum_sum := checksum_sum + substring(cpf_digits FROM i FOR 1)::integer * (12 - i);
  END LOOP;
  check_digit := (checksum_sum * 10) % 11;
  IF check_digit = 10 THEN check_digit := 0; END IF;
  IF check_digit <> substring(cpf_digits FROM 11 FOR 1)::integer THEN
    RAISE EXCEPTION 'Informe um CPF válido do titular do cupom.';
  END IF;

  display_name := NULLIF(trim(_full_name), '');
  IF display_name IS NULL OR length(display_name) < 2 OR length(display_name) > 160 THEN
    display_name := COALESCE(
      NULLIF(trim((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = uid)), ''),
      split_part(account_email, '@', 1)
    );
  END IF;

  INSERT INTO public.partner_requests
    (user_id, full_name, email, tax_id, status, commission_rate, commission_percent, updated_at)
  VALUES
    (uid, display_name, account_email, cpf_digits, 'approved', 20, 20, now())
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        tax_id = EXCLUDED.tax_id,
        status = 'approved',
        updated_at = now()
  RETURNING id INTO partner_record_id;

  SELECT code INTO coupon_code
  FROM public.coupons
  WHERE partner_id = partner_record_id
  ORDER BY created_at
  LIMIT 1;

  IF coupon_code IS NULL THEN
    coupon_code := 'CC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    INSERT INTO public.coupons
      (partner_id, code, discount_percent, commission_percent, is_active, created_at, updated_at)
    VALUES
      (partner_record_id, coupon_code, 20, 20, true, now(), now())
    ON CONFLICT (code) DO NOTHING;
  ELSE
    UPDATE public.coupons
       SET is_active = true, discount_percent = 20, commission_percent = 20, updated_at = now()
     WHERE partner_id = partner_record_id;
  END IF;

  RETURN jsonb_build_object('status', 'approved', 'coupon_code', coupon_code);
END
$function$;

REVOKE ALL ON FUNCTION public.register_accountant_access(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_accountant_access(text, text) TO authenticated;
