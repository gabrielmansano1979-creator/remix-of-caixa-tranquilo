-- Enforce counterparty identity on every new/updated financial entry and enrich private audit details.
-- Existing historical rows are not rewritten; when edited, they must be completed before saving.

CREATE OR REPLACE FUNCTION public.validate_financial_entry_counterparty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NULLIF(btrim(NEW.counterparty_name), '') IS NULL THEN
    IF NEW.type = 'income' THEN
      RAISE EXCEPTION 'COUNTERPARTY_REQUIRED: informe quem pagou à empresa para uma entrada';
    ELSIF NEW.type = 'expense' THEN
      RAISE EXCEPTION 'COUNTERPARTY_REQUIRED: informe quem recebeu o pagamento para uma saída';
    END IF;
  END IF;
  NEW.counterparty_name := btrim(NEW.counterparty_name);
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.validate_financial_entry_counterparty() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS entries_validate_counterparty ON public.entries;
CREATE TRIGGER entries_validate_counterparty
BEFORE INSERT OR UPDATE ON public.entries
FOR EACH ROW EXECUTE FUNCTION public.validate_financial_entry_counterparty();

CREATE OR REPLACE FUNCTION public.capture_financial_entry_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  old_row jsonb;
  new_row jsonb;
  owner_id uuid;
  row_id uuid;
  action_name text;
  registered_company text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_row := to_jsonb(NEW);
    owner_id := NEW.user_id;
    row_id := NEW.id;
    action_name := 'insert';
  ELSIF TG_OP = 'UPDATE' THEN
    old_row := to_jsonb(OLD);
    new_row := to_jsonb(NEW);
    owner_id := NEW.user_id;
    row_id := NEW.id;
    action_name := 'update';
  ELSE
    old_row := to_jsonb(OLD);
    owner_id := OLD.user_id;
    row_id := OLD.id;
    action_name := 'delete';
  END IF;

  SELECT COALESCE(NULLIF(btrim(business_name), ''), NULLIF(btrim(full_name), ''), 'Empresa')
    INTO registered_company
  FROM public.profiles
  WHERE user_id = owner_id;

  INSERT INTO public.financial_audit_logs(client_user_id, actor_user_id, action, entity_type, entity_id, details)
  VALUES (
    owner_id,
    auth.uid(),
    action_name,
    'entry',
    row_id,
    jsonb_build_object(
      'registered_company', registered_company,
      'before', CASE WHEN old_row IS NULL THEN NULL ELSE jsonb_build_object(
        'type', old_row->>'type',
        'company_role', CASE WHEN old_row->>'type' = 'income' THEN 'Empresa que recebe' ELSE 'Empresa que paga' END,
        'description', old_row->>'description',
        'amount_cents', old_row->>'amount_cents',
        'due_date', old_row->>'due_date',
        'status', old_row->>'status',
        'paid_at', old_row->>'paid_at',
        'counterparty_name', old_row->>'counterparty_name',
        'counterparty_email', old_row->>'counterparty_email',
        'counterparty_whatsapp', old_row->>'counterparty_whatsapp',
        'pix_url', old_row->>'pix_url',
        'reminders_muted', old_row->>'reminders_muted',
        'created_at', old_row->>'created_at'
      ) END,
      'after', CASE WHEN new_row IS NULL THEN NULL ELSE jsonb_build_object(
        'type', new_row->>'type',
        'company_role', CASE WHEN new_row->>'type' = 'income' THEN 'Empresa que recebe' ELSE 'Empresa que paga' END,
        'description', new_row->>'description',
        'amount_cents', new_row->>'amount_cents',
        'due_date', new_row->>'due_date',
        'status', new_row->>'status',
        'paid_at', new_row->>'paid_at',
        'counterparty_name', new_row->>'counterparty_name',
        'counterparty_email', new_row->>'counterparty_email',
        'counterparty_whatsapp', new_row->>'counterparty_whatsapp',
        'pix_url', new_row->>'pix_url',
        'reminders_muted', new_row->>'reminders_muted',
        'created_at', new_row->>'created_at'
      ) END
    )
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
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
        'initial_balance_cents', COALESCE(p.initial_balance_cents, 0),
        'balance_date', p.balance_date,
        'entries', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', e.id, 'description', e.description, 'type', e.type,
            'amount_cents', e.amount_cents, 'due_date', e.due_date,
            'status', e.status, 'paid_at', e.paid_at,
            'counterparty_name', e.counterparty_name, 'created_at', e.created_at
          ) ORDER BY e.due_date, e.created_at)
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

CREATE OR REPLACE FUNCTION public.my_accountant_financial_audit()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  partner_record_id uuid;
  result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT id INTO partner_record_id
  FROM public.partner_requests
  WHERE user_id = uid AND status = 'approved';

  IF partner_record_id IS NULL THEN
    RAISE EXCEPTION 'approved accountant registration required';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'client_user_id', a.client_user_id,
    'client_name', COALESCE(NULLIF(btrim(p.business_name), ''), NULLIF(btrim(p.full_name), ''), 'Empresa'),
    'actor_user_id', a.actor_user_id,
    'action', a.action,
    'entity_type', a.entity_type,
    'entity_id', a.entity_id,
    'details', a.details,
    'created_at', a.created_at
  ) ORDER BY a.created_at DESC), '[]'::jsonb)
  INTO result
  FROM (
    SELECT *
    FROM public.financial_audit_logs
    WHERE client_user_id IN (
      SELECT client_user_id
      FROM public.accountant_access
      WHERE partner_id = partner_record_id
    )
    ORDER BY created_at DESC
    LIMIT 500
  ) a
  JOIN public.profiles p ON p.user_id = a.client_user_id;

  RETURN result;
END
$function$;

REVOKE ALL ON FUNCTION public.my_accountant_financial_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_accountant_financial_audit() TO authenticated;
