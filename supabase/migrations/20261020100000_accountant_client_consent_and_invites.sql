-- Separate accountant-client consent from affiliate referrals.
-- No auth provider, login settings, or existing financial records are changed.

CREATE TABLE IF NOT EXISTS public.accountant_client_invites (
  client_user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accountant_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partner_requests(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','revoked')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE (client_user_id, partner_id, requested_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS accountant_access_requests_one_pending
  ON public.accountant_access_requests(client_user_id, partner_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS accountant_access_requests_partner_status_idx
  ON public.accountant_access_requests(partner_id, status);

CREATE TABLE IF NOT EXISTS public.accountant_business_invites (
  partner_id uuid PRIMARY KEY REFERENCES public.partner_requests(id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accountant_business_invite_acceptances (
  client_user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partner_requests(id) ON DELETE CASCADE,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS accountant_business_acceptances_partner_idx
  ON public.accountant_business_invite_acceptances(partner_id, accepted_at);

ALTER TABLE public.accountant_client_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountant_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountant_business_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountant_business_invite_acceptances ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.accountant_client_invites TO authenticated;
GRANT SELECT ON public.accountant_access_requests TO authenticated;
GRANT SELECT ON public.accountant_business_invites TO authenticated;
GRANT SELECT ON public.accountant_business_invite_acceptances TO authenticated;
GRANT ALL ON public.accountant_client_invites TO service_role;
GRANT ALL ON public.accountant_access_requests TO service_role;
GRANT ALL ON public.accountant_business_invites TO service_role;
GRANT ALL ON public.accountant_business_invite_acceptances TO service_role;

DROP POLICY IF EXISTS accountant_client_invites_read_own ON public.accountant_client_invites;
CREATE POLICY accountant_client_invites_read_own ON public.accountant_client_invites
  FOR SELECT TO authenticated USING (client_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS accountant_access_requests_read_parties ON public.accountant_access_requests;
CREATE POLICY accountant_access_requests_read_parties ON public.accountant_access_requests
  FOR SELECT TO authenticated USING (
    client_user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.partner_requests pr WHERE pr.id = partner_id AND pr.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS accountant_business_invites_read_own ON public.accountant_business_invites;
CREATE POLICY accountant_business_invites_read_own ON public.accountant_business_invites
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.partner_requests pr WHERE pr.id = partner_id AND pr.user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS accountant_business_acceptances_read_parties ON public.accountant_business_invite_acceptances;
CREATE POLICY accountant_business_acceptances_read_parties ON public.accountant_business_invite_acceptances
  FOR SELECT TO authenticated USING (
    client_user_id = (SELECT auth.uid())
    OR EXISTS (SELECT 1 FROM public.partner_requests pr WHERE pr.id = partner_id AND pr.user_id = (SELECT auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.my_accountant_client_invite()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE uid uuid := auth.uid(); t uuid; active_name text; active_since timestamptz; pending jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.accountant_client_invites(client_user_id) VALUES (uid) ON CONFLICT (client_user_id) DO NOTHING;
  SELECT token INTO t FROM public.accountant_client_invites WHERE client_user_id = uid;
  SELECT pr.full_name, aa.granted_at INTO active_name, active_since
  FROM public.accountant_access aa JOIN public.partner_requests pr ON pr.id = aa.partner_id
  WHERE aa.client_user_id = uid;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id, 'accountant_name', pr.full_name, 'crc_number', pr.crc_number, 'requested_at', r.requested_at
  ) ORDER BY r.requested_at DESC), '[]'::jsonb) INTO pending
  FROM public.accountant_access_requests r
  JOIN public.partner_requests pr ON pr.id = r.partner_id
  WHERE r.client_user_id = uid AND r.status = 'pending';
  RETURN jsonb_build_object('token', t, 'accountant_name', active_name, 'granted_at', active_since, 'pending_requests', pending);
END
$function$;

CREATE OR REPLACE FUNCTION public.request_accountant_access(_token uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE uid uuid := auth.uid(); client_id uuid; partner_record_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT client_user_id INTO client_id FROM public.accountant_client_invites WHERE token = _token;
  IF client_id IS NULL THEN RAISE EXCEPTION 'invalid accountant invitation'; END IF;
  IF client_id = uid THEN RAISE EXCEPTION 'self access is not allowed'; END IF;
  SELECT id INTO partner_record_id FROM public.partner_requests WHERE user_id = uid AND status = 'approved';
  IF partner_record_id IS NULL THEN RAISE EXCEPTION 'approved accountant registration required'; END IF;
  IF EXISTS (SELECT 1 FROM public.accountant_access WHERE client_user_id = client_id AND partner_id = partner_record_id) THEN
    RAISE EXCEPTION 'access already granted';
  END IF;
  INSERT INTO public.accountant_access_requests(client_user_id, partner_id, status)
  VALUES (client_id, partner_record_id, 'pending')
  ON CONFLICT DO NOTHING;
END
$function$;

CREATE OR REPLACE FUNCTION public.decide_accountant_access(_request_id uuid, _approve boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE uid uuid := auth.uid(); req public.accountant_access_requests%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO req FROM public.accountant_access_requests WHERE id = _request_id AND client_user_id = uid AND status = 'pending' FOR UPDATE;
  IF req.id IS NULL THEN RAISE EXCEPTION 'request not found or already processed'; END IF;
  IF _approve THEN
    -- Preserve the consent history when the customer switches accountants.
    UPDATE public.accountant_access_requests
      SET status = 'revoked', decided_at = now()
      WHERE client_user_id = uid AND status = 'approved';
    DELETE FROM public.accountant_access WHERE client_user_id = uid;
    INSERT INTO public.accountant_access(client_user_id, partner_id, granted_at)
    VALUES (uid, req.partner_id, now())
    ON CONFLICT (client_user_id) DO UPDATE SET partner_id = EXCLUDED.partner_id, granted_at = EXCLUDED.granted_at;
    UPDATE public.accountant_access_requests SET status = 'approved', decided_at = now() WHERE id = req.id;
  ELSE
    UPDATE public.accountant_access_requests SET status = 'rejected', decided_at = now() WHERE id = req.id;
  END IF;
END
$function$;

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
        'business_size', p.business_size,
        'granted_at', aa.granted_at,
        'entries', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('description', e.description, 'type', e.type, 'amount_cents', e.amount_cents, 'due_date', e.due_date, 'status', e.status, 'paid_at', e.paid_at) ORDER BY e.due_date)
          FROM public.entries e WHERE e.user_id = aa.client_user_id
        ), '[]'::jsonb)
      ) ORDER BY p.business_name)
      FROM public.accountant_access aa JOIN public.profiles p ON p.user_id = aa.client_user_id
      WHERE aa.partner_id = partner_record_id
    ), '[]'::jsonb),
    'pending_requests', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id, 'client_name', COALESCE(NULLIF(trim(p.business_name), ''), NULLIF(trim(p.full_name), ''), 'Empresa'), 'requested_at', r.requested_at
      ) ORDER BY r.requested_at DESC)
      FROM public.accountant_access_requests r JOIN public.profiles p ON p.user_id = r.client_user_id
      WHERE r.partner_id = partner_record_id AND r.status = 'pending'
    ), '[]'::jsonb),
    'invited_companies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'client_name', COALESCE(NULLIF(trim(p.business_name), ''), NULLIF(trim(p.full_name), ''), 'Empresa'),
        'accepted_at', a.accepted_at,
        'access_granted', EXISTS (SELECT 1 FROM public.accountant_access aa WHERE aa.client_user_id = a.client_user_id AND aa.partner_id = partner_record_id)
      ) ORDER BY a.accepted_at DESC)
      FROM public.accountant_business_invite_acceptances a JOIN public.profiles p ON p.user_id = a.client_user_id
      WHERE a.partner_id = partner_record_id
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END
$function$;

CREATE OR REPLACE FUNCTION public.accept_accountant_business_invite(_token uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE uid uuid := auth.uid(); partner_record_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT partner_id INTO partner_record_id FROM public.accountant_business_invites WHERE token = _token;
  IF partner_record_id IS NULL THEN RAISE EXCEPTION 'invalid business invitation'; END IF;
  IF EXISTS (SELECT 1 FROM public.partner_requests WHERE id = partner_record_id AND user_id = uid) THEN
    RAISE EXCEPTION 'self invitation is not allowed';
  END IF;
  INSERT INTO public.accountant_business_invite_acceptances(client_user_id, partner_id)
  VALUES (uid, partner_record_id)
  ON CONFLICT (client_user_id) DO UPDATE SET partner_id = EXCLUDED.partner_id, accepted_at = now();
END
$function$;

REVOKE ALL ON FUNCTION public.my_accountant_client_invite() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_accountant_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_accountant_access(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_accountant_portal_invites() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_accountant_business_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_accountant_client_invite() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_accountant_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_accountant_access(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_accountant_portal_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_accountant_business_invite(uuid) TO authenticated;


-- Business size is declared by the customer and used as report context, not as a tax calculation.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_size text;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_business_size_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_business_size_check
  CHECK (business_size IS NULL OR business_size IN ('MEI','ME','EPP','OUTRO'));

-- Financial audit events are visible to the accountant only while the customer has granted access.
CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  actor_user_id uuid,
  action text NOT NULL CHECK (action IN ('insert','update','delete')),
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS financial_audit_logs_client_created_idx
  ON public.financial_audit_logs(client_user_id, created_at DESC);
ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.financial_audit_logs TO authenticated;
GRANT ALL ON public.financial_audit_logs TO service_role;
DROP POLICY IF EXISTS financial_audit_logs_no_direct_read ON public.financial_audit_logs;
CREATE POLICY financial_audit_logs_no_direct_read ON public.financial_audit_logs
  FOR SELECT TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.capture_financial_entry_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE old_row jsonb; new_row jsonb; owner_id uuid; row_id uuid; action_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_row := to_jsonb(NEW); owner_id := NEW.user_id; row_id := NEW.id; action_name := 'insert';
  ELSIF TG_OP = 'UPDATE' THEN
    old_row := to_jsonb(OLD); new_row := to_jsonb(NEW); owner_id := NEW.user_id; row_id := NEW.id; action_name := 'update';
  ELSE
    old_row := to_jsonb(OLD); owner_id := OLD.user_id; row_id := OLD.id; action_name := 'delete';
  END IF;
  INSERT INTO public.financial_audit_logs(client_user_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (
    owner_id,
    auth.uid(),
    action_name,
    'entry',
    row_id,
    jsonb_build_object(
      'before', CASE WHEN old_row IS NULL THEN NULL ELSE jsonb_build_object('type', old_row->>'type', 'description', old_row->>'description', 'amount_cents', old_row->>'amount_cents', 'due_date', old_row->>'due_date', 'status', old_row->>'status', 'counterparty_name', old_row->>'counterparty_name') END,
      'after', CASE WHEN new_row IS NULL THEN NULL ELSE jsonb_build_object('type', new_row->>'type', 'description', new_row->>'description', 'amount_cents', new_row->>'amount_cents', 'due_date', new_row->>'due_date', 'status', new_row->>'status', 'counterparty_name', new_row->>'counterparty_name') END
    )
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.capture_financial_entry_audit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS entries_capture_financial_audit ON public.entries;
CREATE TRIGGER entries_capture_financial_audit
AFTER INSERT OR UPDATE OR DELETE ON public.entries
FOR EACH ROW EXECUTE FUNCTION public.capture_financial_entry_audit();

CREATE OR REPLACE FUNCTION public.my_accountant_financial_audit()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE uid uuid := auth.uid(); partner_record_id uuid; result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT id INTO partner_record_id FROM public.partner_requests WHERE user_id = uid AND status = 'approved';
  IF partner_record_id IS NULL THEN RAISE EXCEPTION 'approved accountant registration required'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'client_user_id', a.client_user_id,
    'client_name', COALESCE(NULLIF(trim(p.business_name), ''), NULLIF(trim(p.full_name), ''), 'Empresa'),
    'action', a.action,
    'entity_type', a.entity_type,
    'entity_id', a.entity_id,
    'details', a.details,
    'created_at', a.created_at
  ) ORDER BY a.created_at DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT * FROM public.financial_audit_logs
    WHERE client_user_id IN (SELECT client_user_id FROM public.accountant_access WHERE partner_id = partner_record_id)
    ORDER BY created_at DESC LIMIT 500
  ) a
  JOIN public.profiles p ON p.user_id = a.client_user_id;
  RETURN result;
END
$function$;
REVOKE ALL ON FUNCTION public.my_accountant_financial_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_accountant_financial_audit() TO authenticated;


-- Revoke the legacy coupon-based grant path: new financial sharing requires an explicit
-- request from the accountant and a separate decision by the customer.
REVOKE ALL ON FUNCTION public.grant_accountant_access(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_accountant_access(text) TO service_role;

-- Keep an explicit revocation record instead of only deleting the active permission.
CREATE OR REPLACE FUNCTION public.revoke_accountant_access()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.accountant_access_requests
    SET status = 'revoked', decided_at = now()
    WHERE client_user_id = uid AND status = 'approved';
  DELETE FROM public.accountant_access WHERE client_user_id = uid;
END
$function$;
REVOKE ALL ON FUNCTION public.revoke_accountant_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_accountant_access() TO authenticated;
