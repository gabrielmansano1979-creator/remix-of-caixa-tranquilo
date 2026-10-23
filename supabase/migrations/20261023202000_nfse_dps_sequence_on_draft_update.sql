-- Keep DPS sequence assignment atomic for new drafts and legacy drafts completed later.
-- Incomplete drafts remain saveable; they receive a number only once the core tax fields
-- needed for an unambiguous DPS sequence are present.
CREATE OR REPLACE FUNCTION public.assign_nfse_dps_sequence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  allocated_number bigint;
BEGIN
  IF NEW.document_type <> 'nfse' OR NEW.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  -- Once allocated, the number and series are immutable for that draft.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.numero_dps IS NOT NULL THEN
      NEW.numero_dps := OLD.numero_dps;
      NEW.serie := OLD.serie;
      RETURN NEW;
    END IF;
  END IF;

  -- Ignore any client-supplied sequence value until the server allocates it.
  NEW.numero_dps := NULL;
  NEW.serie := NULL;

  -- Drafts may be saved incrementally. Do not allocate a sequence until the fields
  -- that define the taxable service are valid; the emission endpoint reports gaps.
  IF NEW.competencia IS NULL
     OR NEW.codigo_trib_nacional IS NULL
     OR NEW.cnae IS NULL
     OR NEW.iss_retido IS NULL
     OR NEW.codigo_trib_nacional !~ '^[0-9]{6}$'
     OR NEW.cnae !~ '^[0-9]{7}$'
     OR (NEW.iss_retido = false AND NEW.aliquota_iss IS NULL)
     OR (NEW.aliquota_iss IS NOT NULL AND (NEW.aliquota_iss < 0 OR NEW.aliquota_iss > 100)) THEN
    RETURN NEW;
  END IF;

  -- The series is server-assigned; never trust a client-provided sequence number.
  NEW.serie := '1';
  INSERT INTO public.nfse_dps_sequences (tenant_user_id, serie, next_number)
    VALUES (NEW.user_id, NEW.serie, 2)
  ON CONFLICT (tenant_user_id, serie)
    DO UPDATE SET next_number = public.nfse_dps_sequences.next_number + 1,
                  updated_at = now()
  RETURNING next_number - 1 INTO allocated_number;

  NEW.numero_dps := allocated_number;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fiscal_invoices_assign_dps_sequence ON public.fiscal_invoices;
CREATE TRIGGER fiscal_invoices_assign_dps_sequence
BEFORE INSERT OR UPDATE ON public.fiscal_invoices
FOR EACH ROW EXECUTE FUNCTION public.assign_nfse_dps_sequence();

-- Drafts may be incomplete while being edited. Enforce the ISS-rate requirement
-- when the invoice leaves draft status, rather than preventing a partial draft save.
ALTER TABLE public.fiscal_invoices
  DROP CONSTRAINT IF EXISTS fiscal_invoices_iss_aliquota_required_chk;

ALTER TABLE public.fiscal_invoices
  ADD CONSTRAINT fiscal_invoices_iss_aliquota_required_chk
  CHECK (
    status = 'draft'
    OR iss_retido IS DISTINCT FROM false
    OR aliquota_iss IS NOT NULL
  ) NOT VALID;
