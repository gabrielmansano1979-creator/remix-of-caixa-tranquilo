-- Admin-only platform observability: aggregate counts plus bounded operational lists.
-- All access is checked inside the SECURITY DEFINER function; no broad table grants are added.
CREATE OR REPLACE FUNCTION public.admin_platform_overview()
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
    'generated_at', now(),
    'counts', jsonb_build_object(
      'registered_clients', (SELECT count(*) FROM public.profiles),
      'auth_accounts', (SELECT count(*) FROM auth.users),
      'onboarded_clients', (SELECT count(*) FROM public.profiles WHERE onboarding_done),
      'onboarding_pending', (SELECT count(*) FROM public.profiles WHERE NOT onboarding_done),
      'new_clients_7d', (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '7 days'),
      'new_clients_30d', (SELECT count(*) FROM public.profiles WHERE created_at >= now() - interval '30 days'),
      'subscribers_active', (SELECT count(*) FROM public.subscriptions WHERE status = 'active'),
      'subscribers_trialing', (SELECT count(*) FROM public.subscriptions WHERE status = 'trialing'),
      'subscribers_past_due', (SELECT count(*) FROM public.subscriptions WHERE status = 'past_due'),
      'subscribers_canceled', (SELECT count(*) FROM public.subscriptions WHERE status = 'canceled'),
      'subscribers_expired', (SELECT count(*) FROM public.subscriptions WHERE status = 'expired'),
      'subscribers_pending_pix', (SELECT count(*) FROM public.subscriptions WHERE status = 'pending_pix'),
      'subscriptions_total', (SELECT count(*) FROM public.subscriptions),
      'checkout_pending', (SELECT count(*) FROM public.pending_billing_changes WHERE status = 'pending'),
      'checkout_processed', (SELECT count(*) FROM public.pending_billing_changes WHERE status = 'processed'),
      'checkout_failed', (SELECT count(*) FROM public.pending_billing_changes WHERE status = 'failed'),
      'payment_events_total', (SELECT count(*) FROM public.asaas_processed_payments),
      'payment_events_failed', (SELECT count(*) FROM public.asaas_processed_payments WHERE status = 'failed'),
      'reminder_logs_total', (SELECT count(*) FROM public.reminder_logs),
      'reminder_logs_failed', (SELECT count(*) FROM public.reminder_logs WHERE status IN ('failed', 'bounced')),
      'reminder_rules_active', (SELECT count(*) FROM public.reminder_rules WHERE active),
      'annual_billing', (SELECT count(*) FROM public.subscriptions WHERE billing_interval::text = 'year' AND status = 'active'),
      'monthly_billing', (SELECT count(*) FROM public.subscriptions WHERE billing_interval::text = 'month' AND status = 'active'),
      'partner_requests_total', (SELECT count(*) FROM public.partner_requests),
      'partner_requests_pending', (SELECT count(*) FROM public.partner_requests WHERE status IN ('pending', 'pending_approval')),
      'partner_requests_approved', (SELECT count(*) FROM public.partner_requests WHERE status = 'approved'),
      'partner_requests_rejected', (SELECT count(*) FROM public.partner_requests WHERE status = 'rejected'),
      'accountant_requests_total', (SELECT count(*) FROM public.accountant_access_requests),
      'accountant_requests_pending', (SELECT count(*) FROM public.accountant_access_requests WHERE status = 'pending'),
      'accountant_requests_approved', (SELECT count(*) FROM public.accountant_access_requests WHERE status = 'approved'),
      'accountant_requests_rejected', (SELECT count(*) FROM public.accountant_access_requests WHERE status = 'rejected'),
      'entries_total', (SELECT count(*) FROM public.entries),
      'entries_pending', (SELECT count(*) FROM public.entries WHERE status = 'pending'),
      'entries_paid', (SELECT count(*) FROM public.entries WHERE status = 'paid'),
      'income_cents', (SELECT COALESCE(sum(amount_cents), 0) FROM public.entries WHERE type::text = 'income'),
      'expense_cents', (SELECT COALESCE(sum(amount_cents), 0) FROM public.entries WHERE type::text = 'expense'),
      'commissions_total', (SELECT count(*) FROM public.commissions),
      'commissions_paid', (SELECT count(*) FROM public.commissions WHERE status = 'paid'),
      'commissions_pending', (SELECT count(*) FROM public.commissions WHERE status IN ('pending', 'available')),
      'commission_amount_cents', (SELECT COALESCE(sum(amount_cents), 0) FROM public.commissions),
      'audit_events_30d', (SELECT count(*) FROM public.audit_logs WHERE created_at >= now() - interval '30 days')
    ),
    'clients', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', p.user_id,
        'name', COALESCE(NULLIF(trim(p.full_name), ''), NULLIF(trim(p.business_name), ''), 'Cliente'),
        'email', COALESCE(NULLIF(trim(p.email), ''), au.email),
        'business_name', p.business_name,
        'created_at', p.created_at,
        'onboarding_done', p.onboarding_done,
        'trial_ends_at', p.trial_ends_at,
        'subscription_status', s.status,
        'plan', s.plan,
        'billing_interval', s.billing_interval,
        'paid_at', s.paid_at,
        'current_period_end', s.current_period_end,
        'cancel_at_period_end', s.cancel_at_period_end,
        'entries_count', (SELECT count(*) FROM public.entries e WHERE e.user_id = p.user_id)
      ) ORDER BY p.created_at DESC NULLS LAST, p.user_id
      )
      FROM (SELECT * FROM public.profiles ORDER BY created_at DESC NULLS LAST LIMIT 200) p
      LEFT JOIN auth.users au ON au.id = p.user_id
      LEFT JOIN public.subscriptions s ON s.user_id = p.user_id
    ), '[]'::jsonb),
    'partner_requests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pr.id, 'user_id', pr.user_id, 'name', pr.full_name,
        'email', COALESCE(pr.email, au.email), 'status', pr.status,
        'created_at', pr.created_at, 'company_name', pr.company_name
      ) ORDER BY
        CASE WHEN pr.status IN ('pending', 'pending_approval') THEN 0 ELSE 1 END,
        pr.created_at ASC NULLS LAST, pr.id
      )
      FROM (SELECT * FROM public.partner_requests ORDER BY CASE WHEN status IN ('pending', 'pending_approval') THEN 0 ELSE 1 END, created_at ASC NULLS LAST, id LIMIT 100) pr
      LEFT JOIN auth.users au ON au.id = pr.user_id
    ), '[]'::jsonb),
    'accountant_requests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'status', r.status, 'requested_at', r.requested_at,
        'decided_at', r.decided_at,
        'client_user_id', r.client_user_id,
        'client_name', COALESCE(NULLIF(trim(cp.full_name), ''), NULLIF(trim(cp.business_name), ''), 'Cliente'),
        'client_email', COALESCE(cp.email, cau.email),
        'accountant_name', pr.full_name,
        'accountant_email', COALESCE(pr.email, pau.email)
      ) ORDER BY
        CASE WHEN r.status = 'pending' THEN 0 ELSE 1 END,
        r.requested_at DESC, r.id
      )
      FROM (SELECT * FROM public.accountant_access_requests ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, requested_at ASC, id LIMIT 100) r
      LEFT JOIN public.profiles cp ON cp.user_id = r.client_user_id
      LEFT JOIN auth.users cau ON cau.id = r.client_user_id
      LEFT JOIN public.partner_requests pr ON pr.id = r.partner_id
      LEFT JOIN auth.users pau ON pau.id = pr.user_id
    ), '[]'::jsonb),
    'recent_audit', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'action', a.action, 'created_at', a.created_at,
        'user_id', a.user_id,
        'user_email', au.email
      ) ORDER BY a.created_at DESC, a.id DESC)
      FROM (SELECT * FROM public.audit_logs ORDER BY created_at DESC LIMIT 25) a
      LEFT JOIN auth.users au ON au.id = a.user_id
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END
$function$;

REVOKE ALL ON FUNCTION public.admin_platform_overview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_platform_overview() TO authenticated;

NOTIFY pgrst, 'reload schema';
