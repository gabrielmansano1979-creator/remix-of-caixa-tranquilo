BEGIN;

-- Accountant access is based on the selected application profile and the
-- company's explicit active consent, not approval for the separate affiliate
-- program (partner_requests).
CREATE OR REPLACE FUNCTION public.my_accountant_fiscal_clients()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  result jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_accountant_user(uid) THEN
    RAISE EXCEPTION 'accountant profile required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'authorized_clients',
    COALESCE(jsonb_agg(jsonb_build_object(
      'client_user_id', ce.empresa_tenant_id,
      'client_name', COALESCE(NULLIF(trim(p.business_name), ''), NULLIF(trim(p.full_name), ''), 'Empresa'),
      'business_size', p.business_size
    ) ORDER BY COALESCE(NULLIF(trim(p.business_name), ''), NULLIF(trim(p.full_name), ''), 'Empresa')), '[]'::jsonb)
  )
  INTO result
  FROM public.contador_empresas ce
  LEFT JOIN public.profiles p ON p.user_id = ce.empresa_tenant_id
  WHERE ce.contador_user_id = uid
    AND ce.status = 'ativo';

  RETURN result;
END;
$function$;

REVOKE ALL ON FUNCTION public.my_accountant_fiscal_clients() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_accountant_fiscal_clients() TO authenticated;

COMMIT;
