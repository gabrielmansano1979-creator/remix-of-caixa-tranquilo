BEGIN;

CREATE OR REPLACE FUNCTION public.revoke_accountant_access()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  UPDATE public.accountant_access_requests
    SET status = 'revoked', decided_at = now()
    WHERE client_user_id = uid AND status = 'approved';

  DELETE FROM public.accountant_access WHERE client_user_id = uid;

  UPDATE public.contador_empresas
    SET status = 'revogado'
    WHERE empresa_tenant_id = uid AND status = 'ativo';
END
$function$;

REVOKE ALL ON FUNCTION public.revoke_accountant_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_accountant_access() TO authenticated;

COMMIT;
