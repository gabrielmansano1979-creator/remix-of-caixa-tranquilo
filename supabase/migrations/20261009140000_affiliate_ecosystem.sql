ALTER TABLE public.partner_requests
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS affiliate_partner_id uuid REFERENCES public.partner_requests(user_id),
  ADD COLUMN IF NOT EXISTS affiliate_coupon_code text,
  ADD COLUMN IF NOT EXISTS affiliate_commission_percent integer,
  ADD COLUMN IF NOT EXISTS affiliate_discount_percent integer,
  ADD COLUMN IF NOT EXISTS affiliate_payment_amount_cents bigint;

ALTER TABLE public.coupons
  DROP CONSTRAINT IF EXISTS coupons_commission_percent_check;

ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_commission_percent_check
  CHECK (commission_percent BETWEEN 20 AND 30);

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS payment_id text;

CREATE UNIQUE INDEX IF NOT EXISTS commissions_payment_id_unique
  ON public.commissions(payment_id);

CREATE TABLE IF NOT EXISTS public.accountant_access (
  client_user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partner_requests(user_id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.accountant_access ENABLE ROW LEVEL SECURITY;

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
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  existing_status text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF length(trim(_full_name)) NOT BETWEEN 2 AND 160
    OR length(regexp_replace(_tax_id, '\D', '', 'g')) NOT IN (11, 14)
    OR upper(_crc_number) !~ '^[A-Z]{2}-[0-9]{6}/[A-Z]$'
    OR _pix_type NOT IN ('cpf', 'cnpj', 'email', 'phone', 'random')
    OR length(trim(_pix_key)) NOT BETWEEN 3 AND 180
  THEN RAISE EXCEPTION 'invalid partner request'; END IF;

  SELECT status INTO existing_status
  FROM public.partner_requests WHERE user_id = uid;
  IF existing_status = 'approved' THEN
    RAISE EXCEPTION 'approved partner details cannot be changed here';
  END IF;

  INSERT INTO public.partner_requests(user_id, full_name, tax_id, crc_number, pix_type, pix_key, status, email)
  VALUES (
    uid, trim(_full_name), regexp_replace(_tax_id, '\D', '', 'g'),
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

CREATE OR REPLACE FUNCTION public.partner_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  result jsonb;
BEGIN
  IF uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.partner_requests
    WHERE user_id = uid AND status = 'approved'
  ) THEN RAISE EXCEPTION 'approved partner access required'; END IF;

  SELECT jsonb_build_object(
    'coupon', (
      SELECT jsonb_build_object('code', c.code, 'discount_percent', c.discount_percent, 'commission_percent', c.commission_percent)
      FROM public.coupons c WHERE c.partner_id = uid AND c.is_active LIMIT 1
    ),
    'totals', jsonb_build_object(
      'commission_cents', COALESCE((SELECT sum(c.amount_cents) FROM public.commissions c WHERE c.partner_id = uid), 0),
      'pending_cents', COALESCE((SELECT sum(c.amount_cents) FROM public.commissions c WHERE c.partner_id = uid AND c.status IN ('pending','available')), 0),
      'paid_cents', COALESCE((SELECT sum(c.amount_cents) FROM public.commissions c WHERE c.partner_id = uid AND c.status = 'paid'), 0),
      'referred_clients', (SELECT count(*) FROM public.subscriptions s WHERE s.affiliate_partner_id = uid),
      'active_clients', (SELECT count(*) FROM public.subscriptions s WHERE s.affiliate_partner_id = uid AND s.status = 'active')
    ),
    'commissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'client_name', c.client_name, 'amount_cents', c.amount_cents,
        'status', c.status, 'created_at', c.created_at, 'paid_at', c.paid_at, 'receipt_url', c.receipt_url
      ) ORDER BY c.created_at DESC)
      FROM public.commissions c WHERE c.partner_id = uid
    ), '[]'::jsonb),
    'clients', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'client_name', p.business_name, 'plan', s.plan, 'status', s.status,
        'entry_count', COALESCE(x.entry_count, 0), 'income_cents', COALESCE(x.income_cents, 0),
        'expense_cents', COALESCE(x.expense_cents, 0), 'shared_at', aa.granted_at,
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

CREATE OR REPLACE FUNCTION public.my_partner_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT jsonb_build_object(
    'status', COALESCE(pr.status, 'none'),
    'full_name', pr.full_name,
    'tax_id', pr.tax_id,
    'crc_number', pr.crc_number,
    'pix_type', pr.pix_type,
    'pix_key', pr.pix_key,
    'coupon', (SELECT jsonb_build_object('code', c.code, 'discount_percent', c.discount_percent, 'commission_percent', c.commission_percent)
      FROM public.coupons c WHERE c.partner_id = uid AND c.is_active LIMIT 1)
  ) INTO result
  FROM (SELECT 1) source
  LEFT JOIN public.partner_requests pr ON pr.user_id = uid;
  RETURN result;
END
$function$;

CREATE OR REPLACE FUNCTION public.grant_accountant_access(_coupon_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  partner uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT c.partner_id INTO partner
  FROM public.coupons c
  JOIN public.partner_requests pr ON pr.user_id = c.partner_id AND pr.status = 'approved'
  WHERE upper(c.code) = upper(trim(_coupon_code)) AND c.is_active;
  IF partner IS NULL THEN RAISE EXCEPTION 'invalid or inactive partner code'; END IF;
  IF partner = uid THEN RAISE EXCEPTION 'self sharing is not allowed'; END IF;

  INSERT INTO public.accountant_access(client_user_id, partner_id)
  VALUES (uid, partner)
  ON CONFLICT (client_user_id) DO UPDATE SET partner_id = EXCLUDED.partner_id, granted_at = now();
END
$function$;

CREATE OR REPLACE FUNCTION public.revoke_accountant_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  DELETE FROM public.accountant_access WHERE client_user_id = auth.uid();
END
$function$;

CREATE OR REPLACE FUNCTION public.my_accountant_access()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_build_object(
    'coupon_code', c.code,
    'partner_name', pr.full_name,
    'granted_at', aa.granted_at
  ), '{}'::jsonb)
  FROM public.accountant_access aa
  JOIN public.partner_requests pr ON pr.user_id = aa.partner_id
  LEFT JOIN public.coupons c ON c.partner_id = aa.partner_id AND c.is_active
  WHERE aa.client_user_id = auth.uid()
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_partner_status(_partner_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role('admin'::public.app_role, auth.uid()) THEN RAISE EXCEPTION 'admin access required'; END IF;
  IF _status NOT IN ('pending_approval', 'approved', 'rejected') THEN RAISE EXCEPTION 'invalid status'; END IF;
  UPDATE public.partner_requests SET status = _status WHERE user_id = _partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'partner not found'; END IF;
  IF _status = 'approved' AND NOT EXISTS (SELECT 1 FROM public.coupons WHERE partner_id = _partner_id) THEN
    INSERT INTO public.coupons(partner_id, code, discount_percent, commission_percent, is_active)
    VALUES (_partner_id, 'CC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), 10, 20, true);
  END IF;
  IF _status <> 'approved' THEN
    UPDATE public.coupons SET is_active = false WHERE partner_id = _partner_id;
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_partner_rate(_partner_id uuid, _percent integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role('admin'::public.app_role, auth.uid()) THEN RAISE EXCEPTION 'admin access required'; END IF;
  IF _percent NOT BETWEEN 20 AND 30 THEN RAISE EXCEPTION 'commission must be between 20 and 30 percent'; END IF;
  UPDATE public.coupons SET commission_percent = _percent WHERE partner_id = _partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'partner coupon not found'; END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_mark_commission_paid(_commission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role('admin'::public.app_role, auth.uid()) THEN RAISE EXCEPTION 'admin access required'; END IF;
  UPDATE public.commissions SET status = 'paid', paid_at = now()
  WHERE id = _commission_id AND status IN ('pending', 'available');
  IF NOT FOUND THEN RAISE EXCEPTION 'commission not found or already paid'; END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.admin_partner_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role('admin'::public.app_role, auth.uid()) THEN RAISE EXCEPTION 'admin access required'; END IF;
  SELECT jsonb_build_object(
    'partners', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', pr.user_id, 'name', pr.full_name, 'tax_id', pr.tax_id,
        'crc_number', pr.crc_number, 'email', COALESCE(pr.email, au.email),
        'pix_type', pr.pix_type, 'pix_key', pr.pix_key, 'status', pr.status,
        'coupon_code', cp.code, 'commission_percent', cp.commission_percent,
        'referrals', (SELECT count(*) FROM public.subscriptions s WHERE s.affiliate_partner_id = pr.user_id),
        'gross_commission_cents', COALESCE((SELECT sum(c.amount_cents) FROM public.commissions c WHERE c.partner_id = pr.user_id), 0)
      ) ORDER BY pr.created_at DESC)
      FROM public.partner_requests pr
      LEFT JOIN auth.users au ON au.id = pr.user_id
      LEFT JOIN public.coupons cp ON cp.partner_id = pr.user_id
    ), '[]'::jsonb),
    'commissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'partner_id', c.partner_id, 'partner_name', pr.full_name,
        'client_name', c.client_name, 'amount_cents', c.amount_cents,
        'status', c.status, 'created_at', c.created_at, 'paid_at', c.paid_at,
        'pix_type', pr.pix_type, 'pix_key', pr.pix_key
      ) ORDER BY c.created_at DESC)
      FROM public.commissions c
      JOIN public.partner_requests pr ON pr.user_id = c.partner_id
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END
$function$;

REVOKE ALL ON FUNCTION public.submit_partner_request(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.partner_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_partner_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_accountant_access(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_accountant_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_accountant_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_partner_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_partner_rate(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_mark_commission_paid(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_partner_overview() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_partner_request(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_partner_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.grant_accountant_access(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_accountant_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_accountant_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_partner_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_partner_rate(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_commission_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_partner_overview() TO authenticated;
