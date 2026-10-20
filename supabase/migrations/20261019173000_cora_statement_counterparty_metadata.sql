-- Persist Cora statement counterparties, roles, source identifiers and transfer classification.
-- Nullable metadata keeps existing manual/CSV imports backwards compatible.
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS sender_name text,
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS counterparty_document text,
  ADD COLUMN IF NOT EXISTS counterparty_original_name text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS is_own_transfer boolean NOT NULL DEFAULT false;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_sender_name_length CHECK (sender_name IS NULL OR length(sender_name) <= 120),
  ADD CONSTRAINT entries_recipient_name_length CHECK (recipient_name IS NULL OR length(recipient_name) <= 120),
  ADD CONSTRAINT entries_counterparty_document_length CHECK (counterparty_document IS NULL OR length(counterparty_document) <= 32),
  ADD CONSTRAINT entries_counterparty_original_name_length CHECK (counterparty_original_name IS NULL OR length(counterparty_original_name) <= 120),
  ADD CONSTRAINT entries_payment_method_length CHECK (payment_method IS NULL OR length(payment_method) <= 60);

CREATE OR REPLACE FUNCTION public.import_entries(_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  acc jsonb;
  n integer;
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
      OR NULLIF(trim(r->>'description'), '') IS NULL
      OR length(r->>'description') > 200
      OR COALESCE(r->>'amount_cents', '') !~ '^[0-9]+$'
      OR (r->>'amount_cents')::numeric <= 0
      OR (r->>'amount_cents')::numeric > 9000000000000000
      OR COALESCE(r->>'due_date', '') !~ '^\d{4}-\d{2}-\d{2}$'
      OR (r->>'due_date')::date IS NULL
      OR NULLIF(btrim(r->>'counterparty_name'), '') IS NULL
      OR length(COALESCE(r->>'counterparty_name', '')) > 120
      OR length(COALESCE(r->>'sender_name', '')) > 120
      OR length(COALESCE(r->>'recipient_name', '')) > 120
      OR length(COALESCE(r->>'counterparty_document', '')) > 32
      OR length(COALESCE(r->>'counterparty_original_name', '')) > 120
      OR length(COALESCE(r->>'payment_method', '')) > 60
      OR (r ? 'is_own_transfer' AND jsonb_typeof(r->'is_own_transfer') NOT IN ('boolean', 'null'))
  ) THEN RAISE EXCEPTION 'INVALID_ROWS'; END IF;

  SELECT count(*) INTO pending_count
  FROM public.entries WHERE user_id = uid AND status = 'pending';
  IF pending_count + n > (acc->'limits'->>'pending_entries')::integer THEN RAISE EXCEPTION 'LIMIT_PENDING'; END IF;
  IF (SELECT count(*) FROM public.entries WHERE user_id = uid AND created_at >= now() - interval '1 hour') > 5000 THEN
    RAISE EXCEPTION 'RATE_LIMIT';
  END IF;

  INSERT INTO public.entries (
    user_id, type, description, amount_cents, due_date, counterparty_name,
    counterparty_email, counterparty_whatsapp, sender_name, recipient_name,
    counterparty_document, counterparty_original_name, payment_method, is_own_transfer
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
    COALESCE((r->>'is_own_transfer')::boolean, false)
  FROM jsonb_array_elements(_rows) AS x(r);
  RETURN n;
END;
$function$;

CREATE OR REPLACE FUNCTION public.capture_financial_entry_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  old_row jsonb; new_row jsonb; owner_id uuid; row_id uuid; action_name text;
  registered_company text; snapshot_balance bigint := 0; snapshot_date date; snapshot_at timestamptz;
  balance_after bigint := 0; old_contribution bigint := 0; new_contribution bigint := 0;
  balance_before bigint := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_row := to_jsonb(NEW); owner_id := NEW.user_id; row_id := NEW.id; action_name := 'insert';
  ELSIF TG_OP = 'UPDATE' THEN
    old_row := to_jsonb(OLD); new_row := to_jsonb(NEW); owner_id := NEW.user_id; row_id := NEW.id; action_name := 'update';
  ELSE
    old_row := to_jsonb(OLD); owner_id := OLD.user_id; row_id := OLD.id; action_name := 'delete';
  END IF;

  SELECT COALESCE(NULLIF(btrim(business_name), ''), NULLIF(btrim(full_name), ''), 'Empresa'),
         COALESCE(initial_balance_cents, 0), balance_date, balance_updated_at
    INTO registered_company, snapshot_balance, snapshot_date, snapshot_at
    FROM public.profiles WHERE user_id = owner_id;

  SELECT COALESCE(snapshot_balance, 0) + COALESCE(SUM(
    CASE WHEN e.status = 'paid'
      AND ((e.paid_at IS NOT NULL AND e.paid_at > COALESCE(snapshot_at, '-infinity'::timestamptz)) OR (e.paid_at IS NULL AND e.due_date > COALESCE(snapshot_date, CURRENT_DATE)))
      THEN CASE WHEN e.type = 'income' THEN e.amount_cents ELSE -e.amount_cents END ELSE 0 END
  ), 0)
  INTO balance_after FROM public.entries e WHERE e.user_id = owner_id;

  IF old_row IS NOT NULL AND old_row->>'status' = 'paid'
    AND ((NULLIF(old_row->>'paid_at', '') IS NOT NULL AND NULLIF(old_row->>'paid_at', '')::timestamptz > COALESCE(snapshot_at, '-infinity'::timestamptz)) OR (NULLIF(old_row->>'paid_at', '') IS NULL AND (old_row->>'due_date')::date > COALESCE(snapshot_date, CURRENT_DATE))) THEN
    old_contribution := (CASE WHEN old_row->>'type' = 'income' THEN 1 ELSE -1 END) * COALESCE((old_row->>'amount_cents')::bigint, 0);
  END IF;
  IF new_row IS NOT NULL AND new_row->>'status' = 'paid'
    AND ((NULLIF(new_row->>'paid_at', '') IS NOT NULL AND NULLIF(new_row->>'paid_at', '')::timestamptz > COALESCE(snapshot_at, '-infinity'::timestamptz)) OR (NULLIF(new_row->>'paid_at', '') IS NULL AND (new_row->>'due_date')::date > COALESCE(snapshot_date, CURRENT_DATE))) THEN
    new_contribution := (CASE WHEN new_row->>'type' = 'income' THEN 1 ELSE -1 END) * COALESCE((new_row->>'amount_cents')::bigint, 0);
  END IF;

  IF TG_OP = 'INSERT' THEN balance_before := balance_after - new_contribution;
  ELSIF TG_OP = 'DELETE' THEN balance_before := balance_after + old_contribution;
  ELSE balance_before := balance_after - new_contribution + old_contribution;
  END IF;

  INSERT INTO public.financial_audit_logs(client_user_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (owner_id, auth.uid(), action_name, 'entry', row_id, jsonb_build_object(
    'registered_company', registered_company, 'balance_before_cents', balance_before, 'balance_after_cents', balance_after,
    'before', CASE WHEN old_row IS NULL THEN NULL ELSE jsonb_build_object(
      'type', old_row->>'type', 'company_role', CASE WHEN old_row->>'type' = 'income' THEN 'Empresa que recebe' ELSE 'Empresa que paga' END,
      'description', old_row->>'description', 'amount_cents', old_row->>'amount_cents', 'due_date', old_row->>'due_date',
      'status', old_row->>'status', 'paid_at', old_row->>'paid_at', 'counterparty_name', old_row->>'counterparty_name',
      'counterparty_email', old_row->>'counterparty_email', 'counterparty_whatsapp', old_row->>'counterparty_whatsapp',
      'counterparty_document', old_row->>'counterparty_document', 'counterparty_original_name', old_row->>'counterparty_original_name',
      'sender_name', old_row->>'sender_name', 'recipient_name', old_row->>'recipient_name',
      'payment_method', old_row->>'payment_method', 'is_own_transfer', old_row->>'is_own_transfer',
      'pix_url', old_row->>'pix_url', 'reminders_muted', old_row->>'reminders_muted', 'created_at', old_row->>'created_at'
    ) END,
    'after', CASE WHEN new_row IS NULL THEN NULL ELSE jsonb_build_object(
      'type', new_row->>'type', 'company_role', CASE WHEN new_row->>'type' = 'income' THEN 'Empresa que recebe' ELSE 'Empresa que paga' END,
      'description', new_row->>'description', 'amount_cents', new_row->>'amount_cents', 'due_date', new_row->>'due_date',
      'status', new_row->>'status', 'paid_at', new_row->>'paid_at', 'counterparty_name', new_row->>'counterparty_name',
      'counterparty_email', new_row->>'counterparty_email', 'counterparty_whatsapp', new_row->>'counterparty_whatsapp',
      'counterparty_document', new_row->>'counterparty_document', 'counterparty_original_name', new_row->>'counterparty_original_name',
      'sender_name', new_row->>'sender_name', 'recipient_name', new_row->>'recipient_name',
      'payment_method', new_row->>'payment_method', 'is_own_transfer', new_row->>'is_own_transfer',
      'pix_url', new_row->>'pix_url', 'reminders_muted', new_row->>'reminders_muted', 'created_at', new_row->>'created_at'
    ) END
  ));
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.capture_financial_entry_audit() FROM PUBLIC, anon, authenticated;

-- Include the new fields in the accountant portal payload; access is still limited to explicitly authorized clients.
CREATE OR REPLACE FUNCTION public.my_accountant_portal_invites()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE uid uuid := auth.uid(); partner_record_id uuid; business_token uuid; result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT id INTO partner_record_id FROM public.partner_requests WHERE user_id = uid AND status = 'approved';
  IF partner_record_id IS NULL THEN RAISE EXCEPTION 'approved accountant registration required'; END IF;
  INSERT INTO public.accountant_business_invites(partner_id) VALUES (partner_record_id) ON CONFLICT (partner_id) DO NOTHING;
  SELECT token INTO business_token FROM public.accountant_business_invites WHERE partner_id = partner_record_id;
  SELECT jsonb_build_object(
    'business_invite_token', business_token,
    'authorized_clients', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'client_user_id', aa.client_user_id,
        'client_name', COALESCE(NULLIF(trim(p.business_name), ''), NULLIF(trim(p.full_name), ''), 'Empresa'),
        'business_size', p.business_size, 'granted_at', aa.granted_at,
        'initial_balance_cents', COALESCE(p.initial_balance_cents, 0), 'balance_date', p.balance_date, 'balance_updated_at', p.balance_updated_at,
        'entries', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', e.id, 'description', e.description, 'type', e.type, 'amount_cents', e.amount_cents, 'due_date', e.due_date,
            'status', e.status, 'paid_at', e.paid_at, 'counterparty_name', e.counterparty_name,
            'sender_name', e.sender_name, 'recipient_name', e.recipient_name,
            'counterparty_document', e.counterparty_document, 'counterparty_original_name', e.counterparty_original_name,
            'payment_method', e.payment_method, 'is_own_transfer', e.is_own_transfer, 'created_at', e.created_at
          ) ORDER BY e.due_date, e.created_at) FROM public.entries e WHERE e.user_id = aa.client_user_id
        ), '[]'::jsonb)
      ) ORDER BY p.business_name)
      FROM public.accountant_access aa JOIN public.profiles p ON p.user_id = aa.client_user_id WHERE aa.partner_id = partner_record_id
    ), '[]'::jsonb),
    'pending_requests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'client_name', COALESCE(NULLIF(trim(p.business_name), ''), NULLIF(trim(p.full_name), ''), 'Empresa'), 'requested_at', r.requested_at) ORDER BY r.requested_at DESC)
      FROM public.accountant_access_requests r JOIN public.profiles p ON p.user_id = r.client_user_id WHERE r.partner_id = partner_record_id AND r.status = 'pending'
    ), '[]'::jsonb),
    'invited_companies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'client_name', COALESCE(NULLIF(trim(p.business_name), ''), NULLIF(trim(p.full_name), ''), 'Empresa'),
        'accepted_at', a.accepted_at,
        'access_granted', EXISTS (SELECT 1 FROM public.accountant_access aa WHERE aa.client_user_id = a.client_user_id AND aa.partner_id = partner_record_id)
      ) ORDER BY a.accepted_at DESC)
      FROM public.accountant_business_invite_acceptances a JOIN public.profiles p ON p.user_id = a.client_user_id WHERE a.partner_id = partner_record_id
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION public.my_accountant_portal_invites() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_accountant_portal_invites() TO authenticated;
