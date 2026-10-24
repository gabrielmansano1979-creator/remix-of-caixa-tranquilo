BEGIN;

ALTER TABLE public.contador_empresas ALTER COLUMN status SET DEFAULT 'ativo';

-- Migrate existing customer-consented accountant grants into the explicit
-- multi-company authorization table without inventing consent.
INSERT INTO public.contador_empresas (contador_user_id, empresa_tenant_id, status, criado_at)
SELECT pr.user_id, aa.client_user_id, 'ativo', COALESCE(aa.granted_at, now())
FROM public.accountant_access aa
JOIN public.partner_requests pr ON pr.id = aa.partner_id
WHERE pr.status = 'approved'
ON CONFLICT (contador_user_id, empresa_tenant_id)
DO UPDATE SET status = 'ativo', criado_at = EXCLUDED.criado_at;

-- Keep the existing client-consent workflow and the new explicit grant table
-- in sync when a client approves or switches accountants.
CREATE OR REPLACE FUNCTION public.decide_accountant_access(_request_id uuid, _approve boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  req public.accountant_access_requests%ROWTYPE;
  accountant_user_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO req
  FROM public.accountant_access_requests
  WHERE id = _request_id AND client_user_id = uid AND status = 'pending'
  FOR UPDATE;

  IF req.id IS NULL THEN RAISE EXCEPTION 'request not found or already processed'; END IF;

  SELECT user_id INTO accountant_user_id
  FROM public.partner_requests
  WHERE id = req.partner_id AND status = 'approved';

  IF _approve THEN
    IF accountant_user_id IS NULL THEN RAISE EXCEPTION 'approved accountant profile required'; END IF;

    UPDATE public.accountant_access_requests
      SET status = 'revoked', decided_at = now()
      WHERE client_user_id = uid AND status = 'approved';

    DELETE FROM public.accountant_access WHERE client_user_id = uid;

    -- A customer approval replaces the prior accountant authorization.
    UPDATE public.contador_empresas
      SET status = 'revogado'
      WHERE empresa_tenant_id = uid AND status = 'ativo';

    INSERT INTO public.accountant_access(client_user_id, partner_id, granted_at)
    VALUES (uid, req.partner_id, now())
    ON CONFLICT (client_user_id) DO UPDATE
      SET partner_id = EXCLUDED.partner_id, granted_at = EXCLUDED.granted_at;

    INSERT INTO public.contador_empresas (contador_user_id, empresa_tenant_id, status, criado_at)
    VALUES (accountant_user_id, uid, 'ativo', now())
    ON CONFLICT (contador_user_id, empresa_tenant_id)
    DO UPDATE SET status = 'ativo', criado_at = EXCLUDED.criado_at;

    UPDATE public.accountant_access_requests
      SET status = 'approved', decided_at = now()
      WHERE id = req.id;
  ELSE
    UPDATE public.accountant_access_requests
      SET status = 'rejected', decided_at = now()
      WHERE id = req.id;
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.decide_accountant_access(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_accountant_access(uuid, boolean) TO authenticated;

COMMIT;
