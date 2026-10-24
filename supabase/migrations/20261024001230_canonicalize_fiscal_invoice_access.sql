BEGIN;

-- The explicit company-consent registry is the single source of truth for
-- accountant access to fiscal documents. Legacy accountant_access rows must not
-- keep access alive after a contador_empresas link has been revoked.
CREATE OR REPLACE FUNCTION public.can_access_fiscal_invoices(_client_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.contador_empresas ce
    WHERE ce.empresa_tenant_id = _client_user_id
      AND ce.contador_user_id = (SELECT auth.uid())
      AND ce.status = 'ativo'
  );
$function$;

REVOKE ALL ON FUNCTION public.can_access_fiscal_invoices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_fiscal_invoices(uuid) TO authenticated;

-- Cover the audit table's invoice foreign key for cleanup and history lookups.
CREATE INDEX IF NOT EXISTS fiscal_emission_audit_invoice_id_idx
  ON public.fiscal_emission_audit (invoice_id);

COMMIT;
