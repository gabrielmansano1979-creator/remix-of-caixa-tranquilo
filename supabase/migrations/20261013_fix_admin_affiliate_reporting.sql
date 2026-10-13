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
