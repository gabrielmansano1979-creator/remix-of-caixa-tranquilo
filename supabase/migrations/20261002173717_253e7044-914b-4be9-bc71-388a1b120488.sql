ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS counterparty_whatsapp text;
CREATE INDEX IF NOT EXISTS entries_user_whatsapp_idx ON public.entries(user_id, counterparty_whatsapp);

CREATE OR REPLACE FUNCTION public.enforce_entry_limits()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE acc jsonb; lim int; cnt int;
BEGIN
  IF current_user <> 'authenticated' THEN RETURN COALESCE(NEW, OLD); END IF;
  acc := public.get_access(auth.uid());
  IF NOT (acc->>'can_write')::boolean THEN
    RAISE EXCEPTION 'READ_ONLY' USING HINT = 'Assinatura necessária';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.status = 'pending' AND (TG_OP = 'INSERT' OR OLD.status <> 'pending') THEN
    lim := (acc->'limits'->>'pending_entries')::int;
    SELECT count(*) INTO cnt FROM public.entries WHERE user_id = NEW.user_id AND status = 'pending';
    IF cnt >= lim THEN RAISE EXCEPTION 'LIMIT_PENDING' USING HINT = lim::text; END IF;
  END IF;
  IF NEW.type = 'income' AND (NEW.counterparty_whatsapp IS NULL OR NEW.counterparty_whatsapp !~ '^\+[1-9][0-9]{9,14}$') THEN
    RAISE EXCEPTION 'WHATSAPP_REQUIRED';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.import_entries(_rows jsonb)
 RETURNS integer LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
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
  INSERT INTO public.entries (user_id, type, description, amount_cents, due_date, counterparty_name, counterparty_email, counterparty_whatsapp)
  SELECT uid, (r->>'type')::public.entry_type, left(r->>'description', 200), (r->>'amount_cents')::bigint,
         (r->>'due_date')::date, left(r->>'counterparty_name', 120), NULLIF(lower(left(r->>'counterparty_email', 255)), ''),
         NULLIF(left(r->>'counterparty_whatsapp', 20), '')
  FROM jsonb_array_elements(_rows) r;
  RETURN n;
END $function$;

DROP FUNCTION IF EXISTS public.top_risks(integer);
CREATE FUNCTION public.top_risks(_limit integer DEFAULT 5)
 RETURNS TABLE(entry_id uuid, description text, counterparty_name text, counterparty_email text, counterparty_whatsapp text, amount_cents bigint, due_date date, score integer, level text, reason text)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH t AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS today),
  avgv AS (SELECT NULLIF(AVG(amount_cents), 0) AS a FROM public.entries WHERE user_id = auth.uid() AND type = 'income'),
  hist AS (
    SELECT COALESCE(counterparty_whatsapp, lower(counterparty_email)) AS k, COUNT(*) FILTER (WHERE (status = 'paid' AND paid_at > due_date)) AS late
    FROM public.entries WHERE user_id = auth.uid() AND type = 'income' AND COALESCE(counterparty_whatsapp, counterparty_email) IS NOT NULL GROUP BY 1
  ),
  s AS (
    SELECT e.*, (t.today - e.due_date) AS dl, COALESCE(h.late, 0) AS late, e.amount_cents::numeric / COALESCE(avgv.a, e.amount_cents) AS rel,
      LEAST(100,
        CASE WHEN t.today - e.due_date > 15 THEN 50 WHEN t.today - e.due_date > 7 THEN 40 WHEN t.today - e.due_date > 0 THEN 30
             WHEN e.due_date - t.today <= 3 THEN 12 ELSE 0 END
        + CASE WHEN e.amount_cents::numeric / COALESCE(avgv.a, e.amount_cents) >= 2 THEN 20 WHEN e.amount_cents::numeric / COALESCE(avgv.a, e.amount_cents) >= 1.2 THEN 10 ELSE 0 END
        + LEAST(COALESCE(h.late, 0) * 12, 30))::int AS sc
    FROM public.entries e CROSS JOIN t CROSS JOIN avgv
    LEFT JOIN hist h ON h.k = COALESCE(e.counterparty_whatsapp, lower(e.counterparty_email))
    WHERE e.user_id = auth.uid() AND e.type = 'income' AND e.status = 'pending' AND e.due_date <= t.today + 30
  )
  SELECT id, description, counterparty_name, counterparty_email, counterparty_whatsapp, amount_cents, due_date, sc,
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
$function$;
GRANT EXECUTE ON FUNCTION public.top_risks(integer) TO authenticated;