-- Extend the Critical Cash free trial to 14 days for new accounts.
-- This migration changes server-side trial creation and profile protections;
-- it does not modify existing customers' trial dates or billing records.
BEGIN;

ALTER TABLE public.profiles
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days');

CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.trial_ends_at := OLD.trial_ends_at;
      NEW.created_at := OLD.created_at;
      NEW.welcome_sent := OLD.welcome_sent;
      NEW.trial_warn_sent := OLD.trial_warn_sent;
      NEW.trial_end_sent := OLD.trial_end_sent;
    ELSE
      NEW.trial_ends_at := now() + interval '14 days';
      NEW.welcome_sent := false;
      NEW.trial_warn_sent := false;
      NEW.trial_end_sent := false;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_setup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.profiles (user_id, trial_ends_at)
  VALUES (uid, now() + interval '14 days')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.subscriptions (user_id, status)
  VALUES (uid, 'trialing')
  ON CONFLICT DO NOTHING;

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
END
$function$;

 
-- Expired trials and non-paying accounts can read profile data but cannot edit
-- any business/profile fields. Service-role operations remain available to trusted
-- billing and administrative workflows.
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

  IF to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
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
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_finance_entitlement();

REVOKE ALL ON FUNCTION public.enforce_profile_finance_entitlement() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_profile_finance_entitlement() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
