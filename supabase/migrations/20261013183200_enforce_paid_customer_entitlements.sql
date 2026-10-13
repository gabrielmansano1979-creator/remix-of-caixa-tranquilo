-- Approved accountants retain the affiliate dashboard, but do not receive a free
-- trial of the financial-product features. An active paid plan still grants normal access.
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
  plan_name text;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user id required';
  END IF;

  -- Prevent authenticated users from inspecting another account's plan state.
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

  trial_end := p.trial_ends_at;
  plan_name := COALESCE(s.plan::text, s.plan_id);

  IF s.status IN ('active', 'past_due')
     AND plan_name IN ('starter', 'pro', 'business') THEN
    eff := plan_name::public.plan_tier;
    can_write := true;
    st := s.status;
  ELSIF EXISTS (
    SELECT 1
    FROM public.partner_requests pr
    WHERE pr.user_id = _user_id
      AND pr.status = 'approved'
  ) THEN
    -- Affiliate tools are available on /contador; financial features still require a plan.
    eff := 'starter';
    can_write := false;
    st := 'expired';
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
    'trial_ends_at', trial_end,
    'has_subscription', s.id IS NOT NULL,
    'current_period_end', s.current_period_end,
    'cancel_at_period_end', COALESCE(s.cancel_at_period_end, false),
    'billing_interval', s.billing_interval,
    'limits', public.plan_limits(eff)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_access(uuid) TO authenticated, service_role;

-- Prevent clients from changing server-managed trial and identity-control columns.
-- Client UI writes only the explicit list below; service-role server operations remain supported.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM PUBLIC, anon, authenticated;
REVOKE INSERT (id, full_name, email, created_at, updated_at, user_id, business_name, reply_to_email, initial_balance_cents, balance_date, cushion_cents, reminders_enabled, trial_ends_at, onboarding_done, notify_product_emails, welcome_sent, trial_warn_sent, trial_end_sent, notification_whatsapp) ON public.profiles FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (id, full_name, email, created_at, updated_at, user_id, business_name, reply_to_email, initial_balance_cents, balance_date, cushion_cents, reminders_enabled, trial_ends_at, onboarding_done, notify_product_emails, welcome_sent, trial_warn_sent, trial_end_sent, notification_whatsapp) ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (full_name, business_name, reply_to_email, initial_balance_cents, balance_date, cushion_cents, reminders_enabled, onboarding_done, notify_product_emails, notification_whatsapp)
  ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;

-- Enforce edit access for direct table writes too; client-side guards alone can be bypassed.
CREATE OR REPLACE FUNCTION public.enforce_entry_write_entitlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  access_data jsonb;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role'
     OR session_user IN ('postgres', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NULL THEN NEW.user_id := uid; END IF;
    IF NEW.user_id IS DISTINCT FROM uid THEN
      RAISE EXCEPTION 'entry owner mismatch' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.user_id IS DISTINCT FROM uid OR NEW.user_id IS DISTINCT FROM uid THEN
      RAISE EXCEPTION 'entry owner mismatch' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.user_id IS DISTINCT FROM uid THEN
      RAISE EXCEPTION 'entry owner mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  access_data := public.my_access();
  IF NOT COALESCE((access_data->>'can_write')::boolean, false) THEN
    RAISE EXCEPTION 'READ_ONLY' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

DROP TRIGGER IF EXISTS entries_enforce_write_entitlement ON public.entries;
CREATE TRIGGER entries_enforce_write_entitlement
BEFORE INSERT OR UPDATE OR DELETE ON public.entries
FOR EACH ROW EXECUTE FUNCTION public.enforce_entry_write_entitlement();

-- A read-only customer cannot change the opening balance or reserve via direct profile updates.
CREATE OR REPLACE FUNCTION public.enforce_profile_finance_entitlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  access_data jsonb;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role'
     OR session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF uid IS NULL OR OLD.user_id IS DISTINCT FROM uid OR NEW.user_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'not authenticated or profile owner mismatch' USING ERRCODE = '42501';
  END IF;

  IF NEW.initial_balance_cents IS DISTINCT FROM OLD.initial_balance_cents
     OR NEW.cushion_cents IS DISTINCT FROM OLD.cushion_cents THEN
    access_data := public.my_access();
    IF NOT COALESCE((access_data->>'can_write')::boolean, false) THEN
      RAISE EXCEPTION 'READ_ONLY' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS profiles_enforce_finance_entitlement ON public.profiles;
CREATE TRIGGER profiles_enforce_finance_entitlement
BEFORE UPDATE OF initial_balance_cents, cushion_cents ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_finance_entitlement();

-- Enforce reminder-plan capabilities on the server, not just disabled UI controls.
CREATE OR REPLACE FUNCTION public.enforce_reminder_rule_entitlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  access_data jsonb;
  limits_data jsonb;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role'
     OR session_user IN ('postgres', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NULL THEN NEW.user_id := uid; END IF;
    IF NEW.user_id IS DISTINCT FROM uid THEN
      RAISE EXCEPTION 'reminder rule owner mismatch' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.user_id IS DISTINCT FROM uid OR NEW.user_id IS DISTINCT FROM uid THEN
      RAISE EXCEPTION 'reminder rule owner mismatch' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.user_id IS DISTINCT FROM uid THEN
      RAISE EXCEPTION 'reminder rule owner mismatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  access_data := public.my_access();
  IF NOT COALESCE((access_data->>'can_write')::boolean, false) THEN
    RAISE EXCEPTION 'READ_ONLY' USING ERRCODE = '42501';
  END IF;
  limits_data := access_data->'limits';

  -- New accounts receive four system defaults; only custom edits are tier-gated here.
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.offset_days IS DISTINCT FROM OLD.offset_days
        OR NEW.active IS DISTINCT FROM OLD.active)
       AND NOT COALESCE((limits_data->>'edit_rule_days')::boolean, false) THEN
      RAISE EXCEPTION 'PLAN_LIMIT: edit_rule_days' USING ERRCODE = '42501';
    END IF;

    IF (NEW.body_tpl IS DISTINCT FROM OLD.body_tpl
        OR NEW.label IS DISTINCT FROM OLD.label
        OR NEW.subject_tpl IS DISTINCT FROM OLD.subject_tpl
        OR NEW.channel IS DISTINCT FROM OLD.channel)
       AND NOT COALESCE((limits_data->>'edit_rule_texts')::boolean, false) THEN
      RAISE EXCEPTION 'PLAN_LIMIT: edit_rule_texts' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

DROP TRIGGER IF EXISTS reminder_rules_enforce_entitlement ON public.reminder_rules;
CREATE TRIGGER reminder_rules_enforce_entitlement
BEFORE INSERT OR UPDATE OR DELETE ON public.reminder_rules
FOR EACH ROW EXECUTE FUNCTION public.enforce_reminder_rule_entitlement();

REVOKE ALL ON FUNCTION public.enforce_entry_write_entitlement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_profile_finance_entitlement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_reminder_rule_entitlement() FROM PUBLIC;
