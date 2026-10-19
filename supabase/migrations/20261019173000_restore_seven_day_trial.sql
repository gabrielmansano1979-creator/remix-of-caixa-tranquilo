-- Restore the documented seven-day trial for fresh environments.
-- The 2026-10-03 migration temporarily changed new profiles to no trial and
-- marked existing trial subscriptions expired. The active database already has
-- the corrected behavior; this migration makes a clean replay match production.
ALTER TABLE public.profiles
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '7 days');

CREATE OR REPLACE FUNCTION public.ensure_user_setup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  INSERT INTO public.profiles (id, user_id, trial_ends_at)
  VALUES (uid, uid, now() + interval '7 days')
  ON CONFLICT (id) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.subscriptions WHERE user_id = uid
  ) THEN
    INSERT INTO public.subscriptions (user_id, status)
    VALUES (uid, 'trialing');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.reminder_rules WHERE user_id = uid
  ) THEN
    INSERT INTO public.reminder_rules
      (user_id, label, offset_days, subject_tpl, body_tpl)
    VALUES
      (uid, 'Lembrete prévio', -2,
       'Lembrete: {{descricao}} vence em {{vencimento}}',
       'Olá, {{cliente}}! Passando para lembrar que {{descricao}}, no valor de {{valor}}, vence em {{vencimento}}. Obrigado! — {{empresa}}'),
      (uid, 'No vencimento', 0,
       'Hoje vence: {{descricao}}',
       'Olá, {{cliente}}! Hoje ({{vencimento}}) vence {{descricao}}, no valor de {{valor}}. Se já pagou, desconsidere. — {{empresa}}'),
      (uid, '3 dias de atraso', 3,
       'Pagamento pendente: {{descricao}}',
       'Olá, {{cliente}}. Não identificamos o pagamento de {{descricao}} ({{valor}}), vencido em {{vencimento}}. Pode verificar? — {{empresa}}'),
      (uid, '7 dias de atraso', 7,
       'Segundo aviso: {{descricao}} em aberto',
       'Olá, {{cliente}}. {{descricao}} ({{valor}}) segue em aberto desde {{vencimento}}. Responda este e-mail se precisar combinar algo. — {{empresa}}');
  END IF;
END;
$function$;
