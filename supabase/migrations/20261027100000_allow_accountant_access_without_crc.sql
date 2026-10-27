-- Allow any authenticated user to activate the accountant workspace without CRC or identity documents.
-- Customer financial data remains gated by explicit customer consent; coupon self-use remains blocked
-- by grant_accountant_access() (partner_user_id = auth.uid()).
CREATE OR REPLACE FUNCTION public.register_accountant_access(_full_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  account_email text;
  display_name text;
  partner_record_id uuid;
  coupon_code text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT email INTO account_email FROM auth.users WHERE id = uid;
  IF account_email IS NULL THEN
    RAISE EXCEPTION 'authenticated account email not found';
  END IF;

  display_name := NULLIF(trim(_full_name), '');
  IF display_name IS NULL OR length(display_name) < 2 OR length(display_name) > 160 THEN
    display_name := COALESCE(
      NULLIF(trim((SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = uid)), ''),
      split_part(account_email, '@', 1)
    );
  END IF;

  INSERT INTO public.partner_requests (user_id, full_name, email, status, commission_rate, commission_percent, updated_at)
  VALUES (uid, display_name, account_email, 'approved', 20, 20, now())
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
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

REVOKE ALL ON FUNCTION public.register_accountant_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_accountant_access(text) TO authenticated;
