CREATE OR REPLACE FUNCTION public.cash_projection(_days int DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  bal bigint; cushion_set bigint; series jsonb; min_bal bigint; min_day date; exp_total bigint; cushion bigint;
BEGIN
  SELECT initial_balance_cents, cushion_cents INTO bal, cushion_set FROM public.profiles WHERE user_id = uid;
  bal := COALESCE(bal, 0);
  WITH days AS (SELECT generate_series(today, today + _days, interval '1 day')::date AS d),
  flows AS (
    SELECT GREATEST(due_date, today) AS d,
           SUM(CASE WHEN type = 'income' THEN amount_cents ELSE -amount_cents END) AS net
    FROM public.entries WHERE user_id = uid AND status = 'pending' AND due_date <= today + _days
    GROUP BY 1
  ),
  acc AS (
    SELECT days.d, bal + SUM(COALESCE(f.net, 0)) OVER (ORDER BY days.d) AS b
    FROM days LEFT JOIN flows f ON f.d = days.d
  )
  SELECT jsonb_agg(jsonb_build_object('date', d, 'balance', b) ORDER BY d) INTO series FROM acc;
  SELECT (e->>'balance')::bigint, (e->>'date')::date INTO min_bal, min_day
    FROM jsonb_array_elements(series) e ORDER BY (e->>'balance')::bigint ASC, (e->>'date') ASC LIMIT 1;
  SELECT COALESCE(SUM(amount_cents), 0) INTO exp_total FROM public.entries
    WHERE user_id = uid AND status = 'pending' AND type = 'expense' AND due_date <= today + _days;
  cushion := CASE WHEN COALESCE(cushion_set, 0) > 0 THEN cushion_set ELSE (exp_total * 20 / 100) END;
  RETURN jsonb_build_object('today', today, 'current', bal, 'series', series, 'min_balance', min_bal, 'min_date', min_day,
    'cushion', cushion, 'status', CASE WHEN min_bal < 0 THEN 'red' WHEN min_bal < cushion THEN 'yellow' ELSE 'green' END);
END $$;
GRANT EXECUTE ON FUNCTION public.cash_projection(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.top_risks(_limit int DEFAULT 5)
RETURNS TABLE(entry_id uuid, description text, counterparty_name text, counterparty_email text, amount_cents bigint, due_date date, score int, level text, reason text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH t AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS today),
  avgv AS (SELECT NULLIF(AVG(amount_cents), 0) AS a FROM public.entries WHERE user_id = auth.uid() AND type = 'income'),
  hist AS (
    SELECT lower(counterparty_email) AS em, COUNT(*) FILTER (WHERE (status = 'paid' AND paid_at > due_date)) AS late
    FROM public.entries WHERE user_id = auth.uid() AND type = 'income' AND counterparty_email IS NOT NULL GROUP BY 1
  ),
  s AS (
    SELECT e.*, (t.today - e.due_date) AS dl, COALESCE(h.late, 0) AS late, e.amount_cents::numeric / COALESCE(avgv.a, e.amount_cents) AS rel,
      LEAST(100,
        CASE WHEN t.today - e.due_date > 15 THEN 50 WHEN t.today - e.due_date > 7 THEN 40 WHEN t.today - e.due_date > 0 THEN 30
             WHEN e.due_date - t.today <= 3 THEN 12 ELSE 0 END
        + CASE WHEN e.amount_cents::numeric / COALESCE(avgv.a, e.amount_cents) >= 2 THEN 20 WHEN e.amount_cents::numeric / COALESCE(avgv.a, e.amount_cents) >= 1.2 THEN 10 ELSE 0 END
        + LEAST(COALESCE(h.late, 0) * 12, 30))::int AS sc
    FROM public.entries e CROSS JOIN t CROSS JOIN avgv
    LEFT JOIN hist h ON h.em = lower(e.counterparty_email)
    WHERE e.user_id = auth.uid() AND e.type = 'income' AND e.status = 'pending' AND e.due_date <= t.today + 30
  )
  SELECT id, description, counterparty_name, counterparty_email, amount_cents, due_date, sc,
    CASE WHEN sc >= 50 THEN 'high' WHEN sc >= 25 THEN 'medium' ELSE 'low' END,
    CASE
      WHEN dl > 0 AND late > 0 THEN 'Atrasada há ' || dl || ' dia(s) e cliente já atrasou ' || late || ' vez(es).'
      WHEN dl > 0 THEN 'Atrasada há ' || dl || ' dia(s).'
      WHEN late > 0 THEN 'Cliente atrasou ' || late || ' pagamento(s) anterior(es).'
      WHEN rel >= 1.2 THEN 'Valor acima da sua média de recebimentos.'
      WHEN -dl <= 3 THEN 'Vence em breve.'
      ELSE 'Sem sinais de risco relevantes.'
    END
  FROM s ORDER BY sc DESC, amount_cents DESC LIMIT LEAST(_limit, 10);
$$;
GRANT EXECUTE ON FUNCTION public.top_risks(int) TO authenticated;