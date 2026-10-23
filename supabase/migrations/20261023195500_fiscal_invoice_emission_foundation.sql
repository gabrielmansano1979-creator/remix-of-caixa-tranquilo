-- Fiscal engine foundation: backward-compatible extension of existing NFS-e drafts.
-- Apply only after reviewing this migration against the deployed schema.
BEGIN;

ALTER TABLE public.fiscal_invoices
  DROP CONSTRAINT IF EXISTS fiscal_invoices_document_type_check;

ALTER TABLE public.fiscal_invoices
  ADD CONSTRAINT fiscal_invoices_document_type_check
  CHECK (document_type IN ('nfse', 'nfe', 'nfce'));

ALTER TABLE public.fiscal_invoices
  ADD COLUMN IF NOT EXISTS chave_acesso varchar(44),
  ADD COLUMN IF NOT EXISTS numero_dps varchar(30),
  ADD COLUMN IF NOT EXISTS serie varchar(3),
  ADD COLUMN IF NOT EXISTS protocolo_autorizacao varchar(100),
  ADD COLUMN IF NOT EXISTS codigo_status_sefaz varchar(20),
  ADD COLUMN IF NOT EXISTS motivo_rejeicao_texto text,
  ADD COLUMN IF NOT EXISTS tentativas_envio integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xml_gerado_url text,
  ADD COLUMN IF NOT EXISTS xml_protocolado_url text,
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS ambiente_fiscal text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS envio_iniciado_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_consulta_em timestamptz,
  ADD COLUMN IF NOT EXISTS atualizado_em timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.fiscal_invoices
  ADD CONSTRAINT fiscal_invoices_chave_acesso_format_check
    CHECK (chave_acesso IS NULL OR chave_acesso ~ '^[0-9]{44}$'),
  ADD CONSTRAINT fiscal_invoices_tentativas_envio_check
    CHECK (tentativas_envio >= 0),
  ADD CONSTRAINT fiscal_invoices_ambiente_fiscal_check
    CHECK (ambiente_fiscal IS NULL OR ambiente_fiscal IN ('producao_restrita','producao'));

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_invoices_chave_acesso_unique
  ON public.fiscal_invoices(chave_acesso) WHERE chave_acesso IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fiscal_invoices_idempotency_key_unique
  ON public.fiscal_invoices(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS fiscal_invoices_dps_lookup_idx
  ON public.fiscal_invoices(user_id, document_type, numero_dps, serie)
  WHERE numero_dps IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fiscal_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.fiscal_invoices(id) ON DELETE CASCADE,
  descricao text NOT NULL CHECK (length(trim(descricao)) BETWEEN 1 AND 1200),
  quantidade numeric(15,4) NOT NULL CHECK (quantidade > 0),
  valor_unitario numeric(15,4) NOT NULL CHECK (valor_unitario >= 0),
  valor_total numeric(15,2) NOT NULL CHECK (valor_total >= 0),
  ncm varchar(8),
  cfop varchar(4),
  cst_csosn varchar(3),
  origem_mercadoria varchar(1),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fiscal_invoice_items_ncm_format_check
    CHECK (ncm IS NULL OR ncm ~ '^[0-9]{8}$'),
  CONSTRAINT fiscal_invoice_items_cfop_format_check
    CHECK (cfop IS NULL OR cfop ~ '^[0-9]{4}$'),
  CONSTRAINT fiscal_invoice_items_cst_csosn_format_check
    CHECK (cst_csosn IS NULL OR cst_csosn ~ '^[0-9]{2,3}$'),
  CONSTRAINT fiscal_invoice_items_origem_format_check
    CHECK (origem_mercadoria IS NULL OR origem_mercadoria IN ('0','1','2','3','4','5','6','7','8'))
);

CREATE INDEX IF NOT EXISTS fiscal_invoice_items_invoice_idx
  ON public.fiscal_invoice_items(invoice_id);

ALTER TABLE public.fiscal_invoice_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_invoice_items TO authenticated;
GRANT ALL ON public.fiscal_invoice_items TO service_role;

DROP POLICY IF EXISTS "fiscal items visible with invoice access" ON public.fiscal_invoice_items;
CREATE POLICY "fiscal items visible with invoice access"
  ON public.fiscal_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fiscal_invoices fi
    WHERE fi.id = invoice_id
      AND (fi.user_id = (SELECT auth.uid())
           OR public.can_access_fiscal_invoices(fi.user_id))
  ));

DROP POLICY IF EXISTS "fiscal items insert with invoice access" ON public.fiscal_invoice_items;
CREATE POLICY "fiscal items insert with invoice access"
  ON public.fiscal_invoice_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fiscal_invoices fi
    WHERE fi.id = invoice_id
      AND fi.status IN ('draft','queued')
      AND (fi.user_id = (SELECT auth.uid())
           OR public.can_access_fiscal_invoices(fi.user_id))
  ));

DROP POLICY IF EXISTS "fiscal items update with invoice access" ON public.fiscal_invoice_items;
CREATE POLICY "fiscal items update with invoice access"
  ON public.fiscal_invoice_items FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fiscal_invoices fi
    WHERE fi.id = invoice_id
      AND fi.status IN ('draft','queued')
      AND (fi.user_id = (SELECT auth.uid())
           OR public.can_access_fiscal_invoices(fi.user_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fiscal_invoices fi
    WHERE fi.id = invoice_id
      AND fi.status IN ('draft','queued')
      AND (fi.user_id = (SELECT auth.uid())
           OR public.can_access_fiscal_invoices(fi.user_id))
  ));

DROP POLICY IF EXISTS "fiscal items delete with invoice access" ON public.fiscal_invoice_items;
CREATE POLICY "fiscal items delete with invoice access"
  ON public.fiscal_invoice_items FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fiscal_invoices fi
    WHERE fi.id = invoice_id
      AND fi.status = 'draft'
      AND (fi.user_id = (SELECT auth.uid())
           OR public.can_access_fiscal_invoices(fi.user_id))
  ));

COMMIT;
