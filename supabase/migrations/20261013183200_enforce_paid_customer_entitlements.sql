-- Keep a pending plan change separate from the currently active subscription.
-- A one-off PIX payment is issued first; only after confirmation is an Asaas recurrence created.
CREATE TABLE IF NOT EXISTS public.pending_billing_changes (
  checkout_reference text PRIMARY KEY,
  payment_id text UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id text NOT NULL,
  plan text NOT NULL CHECK (plan IN ('starter', 'pro', 'business')),
  billing_interval text NOT NULL CHECK (billing_interval IN ('month', 'year')),
  initial_amount_cents bigint NOT NULL CHECK (initial_amount_cents > 0),
  recurring_amount_cents bigint NOT NULL CHECK (recurring_amount_cents > 0),
  affiliate_partner_id uuid,
  affiliate_coupon_code text,
  affiliate_commission_percent integer CHECK (affiliate_commission_percent IS NULL OR affiliate_commission_percent IN (20, 25, 30)),
  affiliate_discount_percent integer CHECK (affiliate_discount_percent IS NULL OR affiliate_discount_percent BETWEEN 0 AND 100),
  previous_asaas_subscription_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pending_billing_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pending_billing_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_billing_changes TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS pending_billing_changes_one_pending_per_user
  ON public.pending_billing_changes(user_id)
  WHERE status = 'pending';

-- Payment-level idempotency complements event-level idempotency because one Asaas
-- payment can emit multiple distinct events (for example CONFIRMED and RECEIVED).
CREATE TABLE IF NOT EXISTS public.asaas_processed_payments (
  payment_id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed')),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asaas_processed_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asaas_processed_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asaas_processed_payments TO service_role;

-- Backfill a paid-period end for legacy subscriptions that only had a one-off Asaas payment.
-- Use the last confirmed payment as the anchor; never extend access from "now".
UPDATE public.subscriptions
SET current_period_end = CASE
  WHEN billing_interval::text = 'year' THEN paid_at + interval '1 year'
  ELSE paid_at + interval '1 month'
END
WHERE status IN ('active', 'past_due')
  AND paid_at IS NOT NULL
  AND current_period_end IS NULL;

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
    'grace_ends_at', grace_end,
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
     OR NEW.balance_date IS DISTINCT FROM OLD.balance_date
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
BEFORE UPDATE OF initial_balance_cents, balance_date, cushion_cents ON public.profiles
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
  limits_data := access_data->'limits';

  -- Allow only the application's four exact default rules to be seeded for each user.
  -- This lets onboarding establish defaults, but never grants custom-rule privileges.
  IF TG_OP = 'INSERT'
     AND NEW.user_id = uid
     AND NEW.active = true
     AND NEW.channel = 'email'
     AND NOT EXISTS (
       SELECT 1 FROM public.reminder_rules rr
       WHERE rr.user_id = uid AND rr.label = NEW.label
     )
     AND (
       (NEW.label = 'Lembrete prévio' AND NEW.offset_days = -2
        AND NEW.subject_tpl = 'Lembrete: {{descricao}} vence em {{vencimento}}'
        AND NEW.body_tpl = 'Olá, {{cliente}}! Passando para lembrar que {{descricao}}, no valor de {{valor}}, vence em {{vencimento}}. Obrigado! — {{empresa}}')
       OR
       (NEW.label = 'No vencimento' AND NEW.offset_days = 0
        AND NEW.subject_tpl = 'Hoje vence: {{descricao}}'
        AND NEW.body_tpl = 'Olá, {{cliente}}! Hoje ({{vencimento}}) vence {{descricao}}, no valor de {{valor}}. Se já pagou, desconsidere. — {{empresa}}')
       OR
       (NEW.label = '3 dias de atraso' AND NEW.offset_days = 3
        AND NEW.subject_tpl = 'Pagamento pendente: {{descricao}}'
        AND NEW.body_tpl = 'Olá, {{cliente}}. Não identificamos o pagamento de {{descricao}} ({{valor}}), vencido em {{vencimento}}. Pode verificar? — {{empresa}}')
       OR
       (NEW.label = '7 dias de atraso' AND NEW.offset_days = 7
        AND NEW.subject_tpl = 'Segundo aviso: {{descricao}} em aberto'
        AND NEW.body_tpl = 'Olá, {{cliente}}. {{descricao}} ({{valor}}) segue em aberto desde {{vencimento}}. Responda este e-mail se precisar combinar algo. — {{empresa}}')
     ) THEN
    RETURN NEW;
  END IF;

  IF NOT COALESCE((access_data->>'can_write')::boolean, false) THEN
    RAISE EXCEPTION 'READ_ONLY' USING ERRCODE = '42501';
  END IF;

  -- Custom rule creation/deletion requires Business, not merely write access.
  IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
    IF NOT COALESCE((limits_data->>'edit_rule_texts')::boolean, false) THEN
      RAISE EXCEPTION 'PLAN_LIMIT: custom reminder rules require Business' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
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
GRANT EXECUTE ON FUNCTION public.enforce_entry_write_entitlement() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_profile_finance_entitlement() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enforce_reminder_rule_entitlement() TO authenticated, service_role;


-- Restrict role introspection to the caller's own user ID (service_role remains trusted).
-- This prevents authenticated users from using has_role to probe other accounts.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN COALESCE(auth.role(), '') <> 'service_role'
      AND (auth.uid() IS NULL OR auth.uid() <> _user_id) THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role::text
    )
  END;
$function$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- Fix legacy admin helper calls to use has_role(user_id, role) in the correct order.
CREATE OR REPLACE FUNCTION public.admin_mark_commission_paid(_commission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin access required';
  END IF;

  UPDATE public.commissions
  SET status = 'paid', paid_at = now()
  WHERE id = _commission_id AND status IN ('pending', 'available');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'commission not found or already paid';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_mark_commission_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_mark_commission_paid(uuid) TO authenticated, service_role;

-- Manual commission overrides are obsolete: the tier is calculated from confirmed unique payers.
REVOKE ALL ON FUNCTION public.admin_update_partner_rate(uuid, integer) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_partner_rate(uuid, integer) TO service_role;

-- This is an event-trigger function, not an API for signed-in users.
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
