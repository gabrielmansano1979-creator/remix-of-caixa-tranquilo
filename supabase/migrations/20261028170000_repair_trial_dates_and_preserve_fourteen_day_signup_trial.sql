-- Repair trial dates that were left at the legacy 7-day/epoch values.
-- Preserve the 14-day trial measured from account/profile creation. This does not
-- revive accounts whose 14-day period has genuinely elapsed.
UPDATE public.profiles p
SET trial_ends_at = p.created_at + interval '14 days'
WHERE p.created_at IS NOT NULL
  AND p.trial_ends_at < p.created_at + interval '14 days'
  AND EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = p.user_id
      AND s.status = 'trialing'
      AND s.plan IS NULL
  );

-- Make the intended 14-day default explicit for any fresh environment.
ALTER TABLE public.profiles
  ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '14 days');

-- Ensure setup initializes the profile and a trial subscription idempotently.
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
  VALUES (uid, uid, now() + interval '14 days')
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
