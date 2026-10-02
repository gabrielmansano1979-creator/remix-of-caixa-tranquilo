ALTER TABLE public.reminder_logs ALTER COLUMN rule_id DROP NOT NULL;
ALTER TABLE public.reminder_logs ADD COLUMN IF NOT EXISTS manual boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_user_action_idx ON public.audit_logs (user_id, action, created_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own audit read" ON public.audit_logs;
CREATE POLICY "own audit read" ON public.audit_logs FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.stripe_events TO service_role;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notify_product_emails boolean NOT NULL DEFAULT true;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS welcome_sent boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_warn_sent boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trial_end_sent boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.protect_profile_fields() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.trial_ends_at := OLD.trial_ends_at; NEW.created_at := OLD.created_at;
      NEW.welcome_sent := OLD.welcome_sent; NEW.trial_warn_sent := OLD.trial_warn_sent; NEW.trial_end_sent := OLD.trial_end_sent;
    ELSE
      NEW.trial_ends_at := now() + interval '7 days'; NEW.welcome_sent := false; NEW.trial_warn_sent := false; NEW.trial_end_sent := false;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.get_access(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.subscriptions; p public.profiles; eff public.plan_tier; can_write boolean := false; st text; grace_end timestamptz;
BEGIN
  SELECT * INTO s FROM public.subscriptions WHERE user_id = _user_id;
  SELECT * INTO p FROM public.profiles WHERE user_id = _user_id;
  IF s.plan IS NOT NULL AND s.status = 'active' THEN
    eff := s.plan; can_write := true; st := 'active';
  ELSIF s.plan IS NOT NULL AND s.status = 'past_due' THEN
    grace_end := COALESCE(s.current_period_end, s.updated_at) + interval '7 days';
    eff := s.plan; can_write := grace_end > now(); st := CASE WHEN can_write THEN 'past_due' ELSE 'expired' END;
  ELSIF s.plan IS NOT NULL AND s.status = 'canceled' AND s.current_period_end > now() THEN
    eff := s.plan; can_write := true; st := 'canceled';
  ELSIF p.trial_ends_at IS NOT NULL AND p.trial_ends_at > now() THEN
    eff := 'pro'; can_write := true; st := 'trialing';
  ELSE
    eff := COALESCE(s.plan, 'starter'); can_write := false; st := 'expired';
  END IF;
  RETURN jsonb_build_object('plan', eff, 'status', st, 'can_write', can_write, 'has_subscription', s.stripe_subscription_id IS NOT NULL,
    'trial_ends_at', p.trial_ends_at, 'grace_ends_at', grace_end, 'current_period_end', s.current_period_end,
    'cancel_at_period_end', COALESCE(s.cancel_at_period_end, false), 'billing_interval', s.billing_interval,
    'limits', public.plan_limits(eff));
END $$;

CREATE OR REPLACE FUNCTION public.my_usage() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'pending_entries', (SELECT count(*) FROM public.entries WHERE user_id = auth.uid() AND status = 'pending'),
    'emails_month', (SELECT count(*) FROM public.reminder_logs WHERE user_id = auth.uid() AND status = 'sent'
        AND sent_at >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')));
$$;
GRANT EXECUTE ON FUNCTION public.my_usage() TO authenticated;

DROP FUNCTION IF EXISTS public.import_entries(jsonb);
CREATE FUNCTION public.import_entries(_rows jsonb) RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); acc jsonb := public.my_access(); n int := jsonb_array_length(_rows); lim int; cnt int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (acc->>'can_write')::boolean THEN RAISE EXCEPTION 'READ_ONLY'; END IF;
  lim := (acc->'limits'->>'csv_rows')::int;
  IF n > lim THEN RAISE EXCEPTION 'LIMIT_CSV' USING HINT = lim::text; END IF;
  SELECT count(*) INTO cnt FROM public.entries WHERE user_id = uid AND created_at > now() - interval '1 hour';
  IF cnt > 5000 THEN RAISE EXCEPTION 'RATE_LIMIT'; END IF;
  SELECT count(*) INTO cnt FROM public.entries WHERE user_id = uid AND status = 'pending';
  IF cnt + n > (acc->'limits'->>'pending_entries')::int THEN RAISE EXCEPTION 'LIMIT_PENDING'; END IF;
  INSERT INTO public.entries (user_id, type, description, amount_cents, due_date, counterparty_name, counterparty_email)
  SELECT uid, (r->>'type')::public.entry_type, left(r->>'description', 200), (r->>'amount_cents')::bigint,
         (r->>'due_date')::date, left(r->>'counterparty_name', 120), NULLIF(lower(left(r->>'counterparty_email', 255)), '')
  FROM jsonb_array_elements(_rows) r;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.import_entries(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.import_entries(jsonb) TO authenticated;

CREATE INDEX IF NOT EXISTS entries_user_status_idx ON public.entries (user_id, status, due_date);