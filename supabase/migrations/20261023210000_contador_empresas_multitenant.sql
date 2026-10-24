BEGIN;

CREATE TABLE IF NOT EXISTS public.contador_empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contador_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_tenant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('ativo', 'revogado', 'pendente')),
  criado_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contador_empresas_unique_pair UNIQUE (contador_user_id, empresa_tenant_id),
  CONSTRAINT contador_empresas_not_self CHECK (contador_user_id <> empresa_tenant_id)
);

CREATE INDEX IF NOT EXISTS contador_empresas_contador_status_idx
  ON public.contador_empresas (contador_user_id, status, criado_at DESC);
CREATE INDEX IF NOT EXISTS contador_empresas_empresa_status_idx
  ON public.contador_empresas (empresa_tenant_id, status, criado_at DESC);

ALTER TABLE public.contador_empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contador_empresas FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.contador_empresas FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contador_empresas TO authenticated;
GRANT ALL ON TABLE public.contador_empresas TO service_role;

DROP POLICY IF EXISTS "contador sees active company links" ON public.contador_empresas;
CREATE POLICY "contador sees active company links"
  ON public.contador_empresas FOR SELECT TO authenticated
  USING (contador_user_id = (SELECT auth.uid()) AND status = 'ativo');

DROP POLICY IF EXISTS "company sees its accountant authorizations" ON public.contador_empresas;
CREATE POLICY "company sees its accountant authorizations"
  ON public.contador_empresas FOR SELECT TO authenticated
  USING (empresa_tenant_id = (SELECT auth.uid()));

-- Only the company owner can authorize an accountant. The role is checked against
-- the authenticated JWT metadata; accountants cannot grant themselves access.
DROP POLICY IF EXISTS "company authorizes accountant" ON public.contador_empresas;
CREATE POLICY "company authorizes accountant"
  ON public.contador_empresas FOR INSERT TO authenticated
  WITH CHECK (
    empresa_tenant_id = (SELECT auth.uid())
    AND status IN ('ativo', 'pendente')
    AND contador_user_id <> (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = contador_user_id
        AND COALESCE(u.raw_user_meta_data ->> 'account_type', '') = 'accountant'
    )
  );

DROP POLICY IF EXISTS "company revokes or updates its authorization" ON public.contador_empresas;
CREATE POLICY "company revokes or updates its authorization"
  ON public.contador_empresas FOR UPDATE TO authenticated
  USING (empresa_tenant_id = (SELECT auth.uid()))
  WITH CHECK (empresa_tenant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "accountant can unlink self" ON public.contador_empresas;
CREATE POLICY "accountant can unlink self"
  ON public.contador_empresas FOR DELETE TO authenticated
  USING (contador_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "company can delete its authorization" ON public.contador_empresas;
CREATE POLICY "company can delete its authorization"
  ON public.contador_empresas FOR DELETE TO authenticated
  USING (empresa_tenant_id = (SELECT auth.uid()));

-- This audit log is intentionally append-only to authenticated callers. Writes
-- are performed by the trusted service role after server-side authorization.
CREATE TABLE IF NOT EXISTS public.fiscal_emission_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.fiscal_invoices(id) ON DELETE SET NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('emission_started', 'emission_incomplete', 'emission_succeeded', 'emission_rejected', 'emission_failed')),
  environment text CHECK (environment IS NULL OR environment IN ('producao_restrita', 'producao')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiscal_emission_audit_tenant_created_idx
  ON public.fiscal_emission_audit (tenant_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS fiscal_emission_audit_actor_created_idx
  ON public.fiscal_emission_audit (actor_user_id, created_at DESC);
ALTER TABLE public.fiscal_emission_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_emission_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fiscal_emission_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.fiscal_emission_audit TO service_role;

-- Keep the existing certificate table service-role-only. Its ciphertext and
-- authentication tags must never be readable from browser sessions; the server
-- checks contador_empresas before using service_role to load a company's config.
ALTER TABLE public.configuracoes_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracoes_fiscais FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.configuracoes_fiscais FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.configuracoes_fiscais TO service_role;

-- Fiscal invoice visibility/creation policies can use the new explicit grant
-- without removing legacy, separately authorized accountant access.
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
      AND ce.contador_user_id = auth.uid()
      AND ce.status = 'ativo'
  ) OR EXISTS (
    SELECT 1
    FROM public.accountant_access aa
    JOIN public.partner_requests pr ON pr.id = aa.partner_id
    WHERE aa.client_user_id = _client_user_id
      AND pr.user_id = auth.uid()
      AND pr.status = 'approved'
  );
$function$;
REVOKE ALL ON FUNCTION public.can_access_fiscal_invoices(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_fiscal_invoices(uuid) TO authenticated;

COMMIT;
