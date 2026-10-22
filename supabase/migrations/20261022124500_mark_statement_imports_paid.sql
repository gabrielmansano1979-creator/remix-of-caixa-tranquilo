-- Bank-statement rows represent completed movements; template imports remain pending.
CREATE OR REPLACE FUNCTION public.import_entries(_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  acc jsonb;
  n integer;
  pending_n integer;
  inserted_n integer;
  lim integer;
  pending_count integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' THEN RAISE EXCEPTION 'INVALID_ROWS'; END IF;
  n := jsonb_array_length(_rows);
  acc := public.my_access();
  IF NOT COALESCE((acc->>'can_write')::boolean, false) THEN RAISE EXCEPTION 'READ_ONLY'; END IF;
  lim := (acc->'limits'->>'csv_rows')::integer;
  IF n > lim THEN RAISE EXCEPTION 'LIMIT_CSV' USING HINT = lim::text; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_rows) AS x(r)
    WHERE jsonb_typeof(r) <> 'object'
      OR COALESCE(r->>'type', '') NOT IN ('income', 'expense')
      OR NULLIF(trim(r->>'description'), '') IS NULL OR length(r->>'description') > 200
      OR COALESCE(r->>'amount_cents', '') !~ '^[0-9]+$'
      OR (r->>'amount_cents')::numeric <= 0 OR (r->>'amount_cents')::numeric > 9000000000000000
      OR COALESCE(r->>'due_date', '') !~ '^\d{4}-\d{2}-\d{2}$' OR (r->>'due_date')::date IS NULL
      OR NULLIF(btrim(r->>'counterparty_name'), '') IS NULL OR length(COALESCE(r->>'counterparty_name', '')) > 120
      OR length(COALESCE(r->>'sender_name', '')) > 120 OR length(COALESCE(r->>'recipient_name', '')) > 120
      OR length(COALESCE(r->>'counterparty_document', '')) > 32 OR length(COALESCE(r->>'counterparty_original_name', '')) > 120
      OR length(COALESCE(r->>'payment_method', '')) > 60
      OR (r ? 'is_own_transfer' AND jsonb_typeof(r->'is_own_transfer') NOT IN ('boolean', 'null'))
      OR (r ? 'is_non_operating' AND jsonb_typeof(r->'is_non_operating') NOT IN ('boolean', 'null'))
      OR (r ? 'is_statement_transaction' AND jsonb_typeof(r->'is_statement_transaction') NOT IN ('boolean', 'null'))
  ) THEN RAISE EXCEPTION 'INVALID_ROWS'; END IF;

  SELECT count(*) INTO pending_n
  FROM jsonb_array_elements(_rows) AS x(r)
  WHERE NOT COALESCE((r->>'is_statement_transaction')::boolean, false);

  SELECT count(*) INTO pending_count
  FROM public.entries WHERE user_id = uid AND status = 'pending';
  IF pending_count + pending_n > (acc->'limits'->>'pending_entries')::integer THEN RAISE EXCEPTION 'LIMIT_PENDING'; END IF;
  IF (SELECT count(*) FROM public.entries WHERE user_id = uid AND created_at >= now() - interval '1 hour') > 5000 THEN
    RAISE EXCEPTION 'RATE_LIMIT';
  END IF;

  INSERT INTO public.entries (
    user_id, type, description, amount_cents, due_date, counterparty_name,
    counterparty_email, counterparty_whatsapp, sender_name, recipient_name,
    counterparty_document, counterparty_original_name, payment_method, is_own_transfer,
    is_non_operating, status, paid_at
  )
  SELECT
    uid,
    (r->>'type')::public.entry_type,
    left(trim(r->>'description'), 200),
    (r->>'amount_cents')::bigint,
    (r->>'due_date')::date,
    NULLIF(left(btrim(r->>'counterparty_name'), 120), ''),
    NULLIF(lower(left(r->>'counterparty_email', 255)), ''),
    NULLIF(left(r->>'counterparty_whatsapp', 20), ''),
    NULLIF(left(r->>'sender_name', 120), ''),
    NULLIF(left(r->>'recipient_name', 120), ''),
    NULLIF(left(r->>'counterparty_document', 32), ''),
    NULLIF(left(r->>'counterparty_original_name', 120), ''),
    NULLIF(left(r->>'payment_method', 60), ''),
    COALESCE((r->>'is_own_transfer')::boolean, false),
    COALESCE((r->>'is_non_operating')::boolean, false),
    CASE WHEN COALESCE((r->>'is_statement_transaction')::boolean, false)
      THEN 'paid'::public.entry_status ELSE 'pending'::public.entry_status END,
    CASE WHEN COALESCE((r->>'is_statement_transaction')::boolean, false)
      THEN ((r->>'due_date')::date::timestamp AT TIME ZONE 'America/Sao_Paulo') ELSE NULL END
  FROM jsonb_array_elements(_rows) AS x(r);

  GET DIAGNOSTICS inserted_n = ROW_COUNT;
  RETURN inserted_n;
END;
$function$;