-- Keep the admin affiliate queue fair: oldest pending applications first,
-- then older historical records before newer ones in every related list.
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
        'created_at', pr.created_at,
        'tax_id', pr.tax_id,
        'crc_number', pr.crc_number,
        'pix_type', pr.pix_type,
        'pix_key', pr.pix_key,
        'coupon_code', cp.code,
        'commission_percent', cp.commission_percent,
        'referrals', (
          SELECT count(DISTINCT s.user_id) FROM public.subscriptions s
          WHERE s.affiliate_partner_id = pr.id AND s.paid_at IS NOT NULL
        )
      ) ORDER BY
        CASE WHEN pr.status IN ('pending_approval', 'pending') THEN 0 ELSE 1 END,
        pr.created_at ASC,
        pr.id ASC)
      FROM public.partner_requests pr
      LEFT JOIN auth.users au ON au.id = pr.user_id
      LEFT JOIN public.coupons cp ON cp.partner_id = pr.id
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
      ) ORDER BY c.created_at ASC, c.id ASC)
      FROM public.commissions c
      LEFT JOIN public.partner_requests pr ON pr.id = c.partner_id
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
      ) ORDER BY s.created_at ASC, s.user_id ASC)
      FROM public.subscriptions s
      JOIN public.partner_requests pr ON pr.id = s.affiliate_partner_id
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

REVOKE ALL ON FUNCTION public.admin_partner_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_partner_overview() TO authenticated;
