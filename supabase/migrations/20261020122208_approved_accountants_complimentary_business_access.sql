-- Give approved accountant partners complimentary Business access for their own company finances.
-- Client-owned records remain scoped by the existing RLS policies; this does not grant admin privileges.
CREATE OR REPLACE FUNCTION public.get_access(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  s public.subscriptions%ROWTYPE;
  p public.profiles%ROWTYPE;
  eff public.plan_tier;
  can_write boolean := false;
  st text;
  trial_end timestamptz;
  grace_end timestamptz;
  plan_name text;
  complimentary_plan public.plan_tier;
  complimentary_accountant boolean := false;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;

  -- A signed-in user can inspect only their own entitlement.
  IF auth.uid() IS NULL THEN
    IF COALESCE(auth.role(), '') <> 'service_role'
       AND session_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'not authenticated';
    END IF;
  ELSIF auth.uid() <> _user_id AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'cannot inspect another user access';
  END IF;

  SELECT * INTO s
  FROM public.subscriptions
  WHERE user_id = _user_id
  LIMIT 1;

  SELECT * INTO p
  FROM public.profiles
  WHERE user_id = _user_id
  LIMIT 1;

  SELECT a.plan INTO complimentary_plan
  FROM public.complimentary_access_allowlist a
  JOIN auth.users u ON lower(u.email) = a.email
  WHERE u.id = _user_id AND a.enabled
  LIMIT 1;

  IF complimentary_plan IS NOT NULL THEN
    RETURN jsonb_build_object(
      'plan', complimentary_plan,
      'status', 'active',
      'can_write', true,
      'trial_ends_at', p.trial_ends_at,
      'has_subscription', false,
      'current_period_end', NULL,
      'grace_ends_at', NULL,
      'cancel_at_period_end', false,
      'billing_interval', NULL,
      'limits', public.plan_limits(complimentary_plan),
      'complimentary', true
    );
  END IF;

  trial_end := p.trial_ends_at;
  plan_name := COALESCE(s.plan::text, s.plan_id);
  grace_end := CASE
    WHEN s.current_period_end IS NOT NULL THEN s.current_period_end + interval '3 days'
    ELSE NULL
  END;

  IF plan_name IN ('starter', 'pro', 'business')
     AND (
       (s.status = 'active' AND s.current_period_end IS NOT NULL AND s.current_period_end > now())
       OR (
         s.status IN ('active', 'past_due')
         AND grace_end IS NOT NULL
         AND grace_end > now()
       )
     ) THEN
    eff := plan_name::public.plan_tier;
    can_write := true;
    st := CASE
      WHEN s.status = 'past_due' OR s.current_period_end <= now() THEN 'past_due'
      ELSE 'active'
    END;
  ELSIF (
    s.status = 'canceled'
    AND COALESCE(s.cancel_at_period_end, false)
    AND s.current_period_end IS NOT NULL
    AND s.current_period_end > now()
    AND plan_name IN ('starter', 'pro', 'business')
  ) THEN
    eff := plan_name::public.plan_tier;
    can_write := true;
    st := 'canceled';
  ELSIF EXISTS (
    SELECT 1
    FROM public.partner_requests pr
    WHERE pr.user_id = _user_id
      AND pr.status = 'approved'
  ) THEN
    -- Approved accountants receive Business features for their own cash flow,
    -- without a paid subscription. This does not widen access to client records.
    eff := 'business';
    can_write := true;
    st := 'active';
    complimentary_accountant := true;
  ELSIF trial_end IS NOT NULL AND trial_end > now() THEN
    eff := 'pro';
    can_write := true;
    st := 'trialing';
  ELSE
    eff := 'starter';
    can_write := false;
    st := 'expired';
  END IF;

  RETURN jsonb_build_object(
    'plan', eff,
    'status', st,
    'can_write', can_write,
    'trial_ends_at', CASE WHEN complimentary_accountant THEN NULL ELSE trial_end END,
    'has_subscription', CASE WHEN complimentary_accountant THEN false ELSE s.id IS NOT NULL END,
    'current_period_end', CASE WHEN complimentary_accountant THEN NULL ELSE s.current_period_end END,
    'grace_ends_at', CASE WHEN complimentary_accountant THEN NULL ELSE grace_end END,
    'cancel_at_period_end', CASE WHEN complimentary_accountant THEN false ELSE COALESCE(s.cancel_at_period_end, false) END,
    'billing_interval', CASE WHEN complimentary_accountant THEN NULL ELSE s.billing_interval END,
    'limits', public.plan_limits(eff),
    'complimentary', complimentary_accountant
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_access(uuid) TO authenticated, service_role;
