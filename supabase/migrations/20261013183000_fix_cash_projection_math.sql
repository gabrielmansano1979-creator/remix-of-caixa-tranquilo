-- Make the cash projection use the same contract as the dashboard and keep paid movements
-- in the current balance after a payment is marked paid.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS balance_updated_at timestamptz;

UPDATE public.profiles
SET balance_updated_at = COALESCE(
  balance_updated_at,
  (balance_date::timestamp AT TIME ZONE 'America/Sao_Paulo')
)
WHERE balance_updated_at IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN balance_updated_at SET DEFAULT now(),
  ALTER COLUMN balance_updated_at SET NOT NULL;

-- Keep the date shown in the UI, but store the exact time a payment was confirmed going forward.
ALTER TABLE public.entries
  ALTER COLUMN paid_at TYPE timestamptz
  USING CASE
    WHEN paid_at IS NULL THEN NULL
    ELSE ((paid_at::date::timestamp + interval '12 hours') AT TIME ZONE 'America/Sao_Paulo')
  END;

CREATE OR REPLACE FUNCTION public.capture_balance_snapshot_time()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $function$
BEGIN
  IF NEW.initial_balance_cents IS DISTINCT FROM OLD.initial_balance_cents THEN
    NEW.balance_updated_at := now();
    NEW.balance_date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS profiles_capture_balance_snapshot_time ON public.profiles;
CREATE TRIGGER profiles_capture_balance_snapshot_time
BEFORE UPDATE OF initial_balance_cents ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.capture_balance_snapshot_time();

CREATE OR REPLACE FUNCTION public.cash_projection(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  current_day date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  opening_balance bigint := 0;
  snapshot_at timestamptz;
  configured_cushion bigint := 0;
  current_balance bigint := 0;
  projected_series jsonb := '[]'::jsonb;
  lowest_balance bigint := 0;
  lowest_day date := current_day;
  forecast_expenses bigint := 0;
  minimum_reserve bigint := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _days IS NULL OR _days < 1 OR _days > 90 THEN
    RAISE EXCEPTION 'days must be between 1 and 90';
  END IF;

  SELECT
    COALESCE(p.initial_balance_cents, 0),
    COALESCE(p.balance_updated_at, p.balance_date::timestamp AT TIME ZONE 'America/Sao_Paulo'),
    COALESCE(p.cushion_cents, 0)
  INTO opening_balance, snapshot_at, configured_cushion
  FROM public.profiles p
  WHERE p.user_id = uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  -- A paid entry changes actual cash once it is paid. The timestamp comparison prevents
  -- counting payments that were already included when the opening balance was last edited.
  SELECT opening_balance + COALESCE(SUM(
    CASE WHEN e.type = 'income' THEN e.amount_cents ELSE -e.amount_cents END
  ), 0)::bigint
  INTO current_balance
  FROM public.entries e
  WHERE e.user_id = uid
    AND e.status = 'paid'
    AND COALESCE(e.paid_at, e.due_date::timestamp AT TIME ZONE 'America/Sao_Paulo') > snapshot_at;

  WITH days AS (
    SELECT generate_series(current_day, current_day + _days, interval '1 day')::date AS day
  ),
  flows AS (
    SELECT
      GREATEST(e.due_date, current_day) AS day,
      SUM(CASE WHEN e.type = 'income' THEN e.amount_cents ELSE -e.amount_cents END)::bigint AS net
    FROM public.entries e
    WHERE e.user_id = uid
      AND e.status = 'pending'
      AND e.due_date <= current_day + _days
    GROUP BY 1
  ),
  balances AS (
    SELECT
      d.day,
      current_balance + SUM(COALESCE(f.net, 0)) OVER (ORDER BY d.day)::bigint AS balance
    FROM days d
    LEFT JOIN flows f ON f.day = d.day
  )
  SELECT
    jsonb_agg(jsonb_build_object('date', day, 'balance', balance) ORDER BY day),
    MIN(balance),
    (ARRAY_AGG(day ORDER BY balance, day))[1]
  INTO projected_series, lowest_balance, lowest_day
  FROM balances;

  SELECT COALESCE(SUM(e.amount_cents), 0)::bigint
  INTO forecast_expenses
  FROM public.entries e
  WHERE e.user_id = uid
    AND e.status = 'pending'
    AND e.type = 'expense'
    AND e.due_date <= current_day + _days;

  minimum_reserve := CASE
    WHEN configured_cushion > 0 THEN configured_cushion
    ELSE (forecast_expenses * 20 / 100)::bigint
  END;

  RETURN jsonb_build_object(
    'today', current_day,
    'current', current_balance,
    'series', COALESCE(projected_series, '[]'::jsonb),
    'min_balance', COALESCE(lowest_balance, current_balance),
    'min_date', COALESCE(lowest_day, current_day),
    'cushion', minimum_reserve,
    'status', CASE
      WHEN COALESCE(lowest_balance, current_balance) < 0 THEN 'red'
      WHEN COALESCE(lowest_balance, current_balance) < minimum_reserve THEN 'yellow'
      ELSE 'green'
    END
  );
END
$function$;

REVOKE ALL ON FUNCTION public.cash_projection(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cash_projection(integer) TO authenticated;
