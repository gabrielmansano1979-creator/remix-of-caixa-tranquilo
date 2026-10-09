ALTER TABLE public.profiles ALTER COLUMN trial_ends_at SET DEFAULT now();
UPDATE public.profiles p SET trial_ends_at = now() FROM public.subscriptions s WHERE s.user_id = p.user_id AND s.status = 'trialing';
UPDATE public.subscriptions SET status = 'expired', updated_at = now() WHERE status = 'trialing';
CREATE OR REPLACE FUNCTION public.ensure_user_setup()
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.profiles (user_id, trial_ends_at) VALUES (uid, now()) ON CONFLICT DO NOTHING;
  INSERT INTO public.subscriptions (user_id, status) VALUES (uid, 'expired') ON CONFLICT DO NOTHING;
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
END $function$;