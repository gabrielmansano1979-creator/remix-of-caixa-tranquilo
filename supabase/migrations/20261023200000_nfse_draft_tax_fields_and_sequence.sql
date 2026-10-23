-- Incremental National NFS-e draft fields and tenant-scoped DPS sequencing.
-- Sequence values are allocated atomically by a SECURITY DEFINER trigger; clients
-- cannot choose or reuse a DPS number. Apply in Supabase migrations.
ALTER TABLE public.fiscal_invoices
  ADD COLUMN IF NOT EXISTS competencia date,
  ADD COLUMN IF NOT EXISTS codigo_trib_nacional text,
  ADD COLUMN IF NOT EXISTS cnae text,
  ADD COLUMN IF NOT EXISTS iss_retido boolean,
  ADD COLUMN IF NOT EXISTS aliquota_iss numeric(5,2),
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS numero_dps bigint;

-- Keep old drafts readable; enforce required fields for new drafts in the trigger.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_invoices_codigo_trib_nacional_chk') THEN
    ALTER TABLE public.fiscal_invoices ADD CONSTRAINT fiscal_invoices_codigo_trib_nacional_chk
      CHECK (codigo_trib_nacional IS NULL OR codigo_trib_nacional ~ '^[0-9]{6}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_invoices_cnae_chk') THEN
    ALTER TABLE public.fiscal_invoices ADD CONSTRAINT fiscal_invoices_cnae_chk
      CHECK (cnae IS NULL OR cnae ~ '^[0-9]{7}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_invoices_aliquota_iss_chk') THEN
    ALTER TABLE public.fiscal_invoices ADD CONSTRAINT fiscal_invoices_aliquota_iss_chk
      CHECK (aliquota_iss IS NULL OR (aliquota_iss >= 0 AND aliquota_iss <= 100)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_invoices_serie_chk') THEN
    ALTER TABLE public.fiscal_invoices ADD CONSTRAINT fiscal_invoices_serie_chk
      CHECK (serie IS NULL OR serie ~ '^[0-9]{1,5}$') NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fiscal_invoices_numero_dps_chk') THEN
    ALTER TABLE public.fiscal_invoices ADD CONSTRAINT fiscal_invoices_numero_dps_chk
      CHECK (numero_dps IS NULL OR numero_dps > 0) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.nfse_dps_sequences (
  tenant_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  serie text NOT NULL DEFAULT '1' CHECK (serie ~ '^[0-9]{1,5}$'),
  next_number bigint NOT NULL DEFAULT 1 CHECK (next_number > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_user_id, serie)
);
REVOKE ALL ON public.nfse_dps_sequences FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.nfse_dps_sequences TO service_role;

CREATE OR REPLACE FUNCTION public.assign_nfse_dps_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  allocated_number bigint;
BEGIN
  IF NEW.document_type <> 'nfse' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'draft' THEN
    IF NEW.competencia IS NULL OR NEW.codigo_trib_nacional IS NULL OR NEW.cnae IS NULL OR NEW.iss_retido IS NULL THEN
      RAISE EXCEPTION 'Campos fiscais obrigatórios ausentes (competência, código nacional, CNAE e retenção do ISS).'
        USING ERRCODE = '23514';
    END IF;
    IF NOT NEW.iss_retido AND NEW.aliquota_iss IS NULL THEN
      RAISE EXCEPTION 'Alíquota do ISS é obrigatória quando o ISS não é retido.'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.codigo_trib_nacional !~ '^[0-9]{6}$' OR NEW.cnae !~ '^[0-9]{7}$' THEN
      RAISE EXCEPTION 'Código de Tributação Nacional ou CNAE em formato inválido.'
        USING ERRCODE = '23514';
    END IF;

    -- Ignore any client-supplied number and allocate per tenant/series atomically.
    NEW.serie := COALESCE(NULLIF(NEW.serie, ''), '1');
    INSERT INTO public.nfse_dps_sequences (tenant_user_id, serie, next_number)
      VALUES (NEW.user_id, NEW.serie, 2)
    ON CONFLICT (tenant_user_id, serie)
      DO UPDATE SET next_number = public.nfse_dps_sequences.next_number + 1,
                    updated_at = now()
    RETURNING next_number - 1 INTO allocated_number;
    NEW.numero_dps := allocated_number;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fiscal_invoices_assign_dps_sequence ON public.fiscal_invoices;
CREATE TRIGGER fiscal_invoices_assign_dps_sequence
BEFORE INSERT ON public.fiscal_invoices
FOR EACH ROW EXECUTE FUNCTION public.assign_nfse_dps_sequence();

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_invoices_tenant_dps_number_uidx
  ON public.fiscal_invoices (user_id, serie, numero_dps)
  WHERE serie IS NOT NULL AND numero_dps IS NOT NULL;
