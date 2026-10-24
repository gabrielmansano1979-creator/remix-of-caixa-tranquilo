BEGIN;

-- Accountant authorization must come from an approved office profile, not
-- user-editable auth.users.raw_user_meta_data.
CREATE OR REPLACE FUNCTION public.is_accountant_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.partner_requests pr
    WHERE pr.user_id = _user_id
      AND pr.status = 'approved'
  );
$function$;

REVOKE ALL ON FUNCTION public.is_accountant_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_accountant_user(uuid) TO authenticated;

DROP POLICY IF EXISTS "company authorizes accountant" ON public.contador_empresas;
CREATE POLICY "company authorizes accountant"
  ON public.contador_empresas FOR INSERT TO authenticated
  WITH CHECK (
    empresa_tenant_id = (SELECT auth.uid())
    AND status IN ('ativo', 'pendente')
    AND contador_user_id <> (SELECT auth.uid())
    AND public.is_accountant_user(contador_user_id)
  );

DROP POLICY IF EXISTS "company revokes or updates its authorization" ON public.contador_empresas;
CREATE POLICY "company revokes or updates its authorization"
  ON public.contador_empresas FOR UPDATE TO authenticated
  USING (empresa_tenant_id = (SELECT auth.uid()))
  WITH CHECK (
    empresa_tenant_id = (SELECT auth.uid())
    AND contador_user_id <> (SELECT auth.uid())
    AND public.is_accountant_user(contador_user_id)
    AND status IN ('ativo', 'revogado', 'pendente')
  );

COMMIT;
