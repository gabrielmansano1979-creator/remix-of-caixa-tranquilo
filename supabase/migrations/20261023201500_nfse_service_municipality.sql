-- Persist the service municipality separately from the issuer municipality.
-- It is a required DPS cLocPrestacao value and must never be inferred from the issuer.
ALTER TABLE public.fiscal_invoices
  ADD COLUMN IF NOT EXISTS municipio_prestacao_ibge varchar(7);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fiscal_invoices_municipio_prestacao_ibge_chk'
  ) THEN
    ALTER TABLE public.fiscal_invoices
      ADD CONSTRAINT fiscal_invoices_municipio_prestacao_ibge_chk
      CHECK (municipio_prestacao_ibge IS NULL OR municipio_prestacao_ibge ~ '^[0-9]{7}$')
      NOT VALID;
  END IF;
END $$;
