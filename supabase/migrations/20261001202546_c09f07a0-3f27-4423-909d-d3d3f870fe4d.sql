CREATE TYPE public.entry_type AS ENUM ('income','expense');
CREATE TYPE public.entry_status AS ENUM ('pending','paid');
CREATE TYPE public.reminder_status AS ENUM ('sent','failed','bounced');
CREATE TYPE public.plan_tier AS ENUM ('starter','pro','business');
CREATE TYPE public.sub_status AS ENUM ('trialing','active','past_due','canceled','expired');
CREATE TYPE public.billing_interval AS ENUM ('month','year');

CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY,
  business_name text,
  reply_to_email text,
  initial_balance_cents bigint NOT NULL DEFAULT 0,
  balance_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  cushion_cents bigint NOT NULL DEFAULT 0,
  reminders_enabled boolean NOT NULL DEFAULT true,
  trial_ends_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  onboarding_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- trial_ends_at must not be user-editable
CREATE OR REPLACE FUNCTION public.protect_profile_fields() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'UPDATE' THEN NEW.trial_ends_at := OLD.trial_ends_at; NEW.created_at := OLD.created_at;
    ELSE NEW.trial_ends_at := now() + interval '7 days'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_protect BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

CREATE TABLE public.entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  type public.entry_type NOT NULL,
  description text NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  due_date date NOT NULL,
  counterparty_name text,
  counterparty_email text,
  status public.entry_status NOT NULL DEFAULT 'pending',
  paid_at date,
  reminders_muted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entries_user_due_idx ON public.entries (user_id, due_date);
CREATE INDEX entries_user_email_idx ON public.entries (user_id, counterparty_email);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entries TO authenticated;
GRANT ALL ON public.entries TO service_role;
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own entries" ON public.entries FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.reminder_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  label text NOT NULL,
  offset_days int NOT NULL,
  subject_tpl text NOT NULL,
  body_tpl text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reminder_rules_user_idx ON public.reminder_rules (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_rules TO authenticated;
GRANT ALL ON public.reminder_rules TO service_role;
ALTER TABLE public.reminder_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rules" ON public.reminder_rules FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entry_id uuid NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.reminder_rules(id) ON DELETE CASCADE,
  sent_to text NOT NULL,
  status public.reminder_status NOT NULL,
  provider_id text,
  error text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, rule_id)
);
CREATE INDEX reminder_logs_user_sent_idx ON public.reminder_logs (user_id, sent_at);
GRANT SELECT ON public.reminder_logs TO authenticated;
GRANT ALL ON public.reminder_logs TO service_role;
ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own logs read" ON public.reminder_logs FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.subscriptions (
  user_id uuid PRIMARY KEY,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan public.plan_tier,
  status public.sub_status NOT NULL DEFAULT 'trialing',
  billing_interval public.billing_interval,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sub read" ON public.subscriptions FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.unsubscribed_emails (
  user_id uuid NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, email)
);
GRANT SELECT, DELETE ON public.unsubscribed_emails TO authenticated;
GRANT ALL ON public.unsubscribed_emails TO service_role;
ALTER TABLE public.unsubscribed_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own unsub read" ON public.unsubscribed_emails FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own unsub delete" ON public.unsubscribed_emails FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Server-side plan limits (mirror of src/config/plans.ts)
CREATE OR REPLACE FUNCTION public.plan_limits(_plan public.plan_tier)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _plan
    WHEN 'starter' THEN '{"pending_entries":100,"emails_per_month":150,"csv_rows":100,"top_risks":3,"edit_rule_days":false,"edit_rule_texts":false}'::jsonb
    WHEN 'pro' THEN '{"pending_entries":500,"emails_per_month":800,"csv_rows":500,"top_risks":5,"edit_rule_days":true,"edit_rule_texts":false}'::jsonb
    WHEN 'business' THEN '{"pending_entries":2000,"emails_per_month":4000,"csv_rows":2000,"top_risks":10,"edit_rule_days":true,"edit_rule_texts":true}'::jsonb
  END $$;

-- Effective access: plan + whether user can write
CREATE OR REPLACE FUNCTION public.get_access(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.subscriptions; p public.profiles; eff public.plan_tier; can_write boolean := false; st text;
BEGIN
  SELECT * INTO s FROM public.subscriptions WHERE user_id = _user_id;
  SELECT * INTO p FROM public.profiles WHERE user_id = _user_id;
  IF s.status IN ('active','past_due') AND s.plan IS NOT NULL THEN
    eff := s.plan; can_write := true; st := s.status::text;
  ELSIF p.trial_ends_at IS NOT NULL AND p.trial_ends_at > now() THEN
    eff := 'pro'; can_write := true; st := 'trialing';
  ELSE
    eff := COALESCE(s.plan, 'starter'); can_write := false; st := 'expired';
  END IF;
  RETURN jsonb_build_object('plan', eff, 'status', st, 'can_write', can_write,
    'trial_ends_at', p.trial_ends_at, 'limits', public.plan_limits(eff));
END $$;
REVOKE EXECUTE ON FUNCTION public.get_access(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_access(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_access() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_access(auth.uid()) $$;
REVOKE EXECUTE ON FUNCTION public.my_access() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_access() TO authenticated;

-- Idempotent user bootstrap: profile + default reminder rules (-2, 0, +3, +7)
CREATE OR REPLACE FUNCTION public.ensure_user_setup() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.profiles (user_id) VALUES (uid) ON CONFLICT DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM public.reminder_rules WHERE user_id = uid) THEN
    INSERT INTO public.reminder_rules (user_id, label, offset_days, subject_tpl, body_tpl) VALUES
    (uid, 'Lembrete prévio', -2, 'Lembrete: {{descricao}} vence em {{vencimento}}',
     'Olá, {{cliente}}! Passando para lembrar que {{descricao}}, no valor de {{valor}}, vence em {{vencimento}}. Obrigado! — {{empresa}}'),
    (uid, 'No vencimento', 0, 'Hoje vence: {{descricao}}',
     'Olá, {{cliente}}! Hoje ({{vencimento}}) vence {{descricao}}, no valor de {{valor}}. Se já pagou, desconsidere. — {{empresa}}'),
    (uid, '3 dias de atraso', 3, 'Pagamento pendente: {{descricao}}',
     'Olá, {{cliente}}. Não identificamos o pagamento de {{descricao}} ({{valor}}), vencido em {{vencimento}}. Pode verificar? — {{empresa}}'),
    (uid, '7 dias de atraso', 7, 'Segundo aviso: {{descricao}} em aberto',
     'Olá, {{cliente}}. {{descricao}} ({{valor}}) segue em aberto desde {{vencimento}}. Responda este e-mail se precisar combinar algo. — {{empresa}}');
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.ensure_user_setup() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ensure_user_setup() TO authenticated;