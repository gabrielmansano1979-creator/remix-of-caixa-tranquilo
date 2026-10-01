CREATE OR REPLACE FUNCTION public.enforce_entry_limits() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF NEW.type = 'income' AND (NEW.counterparty_email IS NULL OR NEW.counterparty_email = '') THEN
    RAISE EXCEPTION 'EMAIL_REQUIRED';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_entry_limits() FROM public, anon, authenticated;
CREATE TRIGGER entries_limits BEFORE INSERT OR UPDATE OR DELETE ON public.entries FOR EACH ROW EXECUTE FUNCTION public.enforce_entry_limits();

-- CSV import: validates row limit and inserts atomically (RLS applies as caller)
CREATE OR REPLACE FUNCTION public.import_entries(_rows jsonb) RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE acc jsonb := public.my_access(); n int := jsonb_array_length(_rows); lim int; cnt int; newpend int;
BEGIN
  IF NOT (acc->>'can_write')::boolean THEN RAISE EXCEPTION 'READ_ONLY'; END IF;
  lim := (acc->'limits'->>'csv_rows')::int;
  IF n > lim THEN RAISE EXCEPTION 'LIMIT_CSV' USING HINT = lim::text; END IF;
  SELECT count(*) INTO cnt FROM public.entries WHERE user_id = auth.uid() AND status = 'pending';
  IF cnt + n > (acc->'limits'->>'pending_entries')::int THEN
    RAISE EXCEPTION 'LIMIT_PENDING' USING HINT = (acc->'limits'->>'pending_entries');
  END IF;
  INSERT INTO public.entries (user_id, type, description, amount_cents, due_date, counterparty_name, counterparty_email)
  SELECT auth.uid(), (r->>'type')::public.entry_type, left(r->>'description', 200), (r->>'amount_cents')::bigint,
         (r->>'due_date')::date, left(r->>'counterparty_name', 120), NULLIF(lower(left(r->>'counterparty_email', 255)), '')
  FROM jsonb_array_elements(_rows) r;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.import_entries(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.import_entries(jsonb) TO authenticated;