-- Critical Cash: foundation for NFS-e workflow.
-- This stores drafts only. Official transmission must be implemented server-side with
-- taxpayer authorization and the required ICP-Brasil certificate; never store API secrets here.
CREATE TABLE IF NOT EXISTS public.fiscal_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  document_type text NOT NULL DEFAULT 'nfse' CHECK (document_type IN ('nfse')),
  issuer_name text NOT NULL CHECK (length(trim(issuer_name)) BETWEEN 2 AND 180),
  issuer_cnpj text NOT NULL CHECK (issuer_cnpj ~ '^[A-Z0-9]{12}[0-9]{2}
  issuer_city_ibge text NOT NULL CHECK (issuer_city_ibge ~ '^[0-9]{7}$'),
  recipient_name text NOT NULL CHECK (length(trim(recipient_name)) BETWEEN 2 AND 180),
  recipient_tax_id text NOT NULL CHECK (recipient_tax_id ~ '^[0-9]{11}$|^[A-Z0-9]{12}[0-9]{2}
  service_description text NOT NULL CHECK (length(trim(service_description)) BETWEEN 3 AND 2000),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','queued','issued','rejected','canceled')),
  access_key text,
  invoice_number text,
  official_pdf_url text,
  official_xml_url text,
  provider_response jsonb,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiscal_invoices_user_created_idx
  ON public.fiscal_invoices (user_id, created_at DESC);
ALTER TABLE public.fiscal_invoices ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.fiscal_invoices TO authenticated;
GRANT ALL ON public.fiscal_invoices TO service_role;
DROP POLICY IF EXISTS "users manage own fiscal invoice drafts" ON public.fiscal_invoices;
DROP POLICY IF EXISTS "fiscal invoices visible to owner and authorized accountant" ON public.fiscal_invoices;
DROP POLICY IF EXISTS "fiscal invoices insert by owner or authorized accountant" ON public.fiscal_invoices;

CREATE POLICY "fiscal invoices visible to owner and authorized accountant"
  ON public.fiscal_invoices FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.accountant_access aa
      JOIN public.partner_requests pr ON pr.id = aa.partner_id
      WHERE aa.client_user_id = fiscal_invoices.user_id
        AND pr.user_id = (SELECT auth.uid())
        AND pr.status = 'approved'
    )
  );

CREATE POLICY "fiscal invoices insert by owner or authorized accountant"
  ON public.fiscal_invoices FOR INSERT TO authenticated
  WITH CHECK (
    created_by_user_id = (SELECT auth.uid())
    AND (
      user_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.accountant_access aa
        JOIN public.partner_requests pr ON pr.id = aa.partner_id
        WHERE aa.client_user_id = fiscal_invoices.user_id
          AND pr.user_id = (SELECT auth.uid())
          AND pr.status = 'approved'
      )
    )
  );
),
  issuer_city_ibge text NOT NULL CHECK (issuer_city_ibge ~ '^[0-9]{7}$'),
  recipient_name text NOT NULL CHECK (length(trim(recipient_name)) BETWEEN 2 AND 180),
  recipient_tax_id text NOT NULL CHECK (recipient_tax_id ~ '^[0-9]{11}$|^[0-9]{14}$'),
  service_description text NOT NULL CHECK (length(trim(service_description)) BETWEEN 3 AND 2000),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','queued','issued','rejected','canceled')),
  access_key text,
  invoice_number text,
  official_pdf_url text,
  official_xml_url text,
  provider_response jsonb,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiscal_invoices_user_created_idx
  ON public.fiscal_invoices (user_id, created_at DESC);
ALTER TABLE public.fiscal_invoices ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_invoices TO authenticated;
GRANT ALL ON public.fiscal_invoices TO service_role;
DROP POLICY IF EXISTS "users manage own fiscal invoice drafts" ON public.fiscal_invoices;
CREATE POLICY "users manage own fiscal invoice drafts"
  ON public.fiscal_invoices FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
),
  service_description text NOT NULL CHECK (length(trim(service_description)) BETWEEN 3 AND 2000),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','queued','issued','rejected','canceled')),
  access_key text,
  invoice_number text,
  official_pdf_url text,
  official_xml_url text,
  provider_response jsonb,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiscal_invoices_user_created_idx
  ON public.fiscal_invoices (user_id, created_at DESC);
ALTER TABLE public.fiscal_invoices ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_invoices TO authenticated;
GRANT ALL ON public.fiscal_invoices TO service_role;
DROP POLICY IF EXISTS "users manage own fiscal invoice drafts" ON public.fiscal_invoices;
CREATE POLICY "users manage own fiscal invoice drafts"
  ON public.fiscal_invoices FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
),
  issuer_city_ibge text NOT NULL CHECK (issuer_city_ibge ~ '^[0-9]{7}$'),
  recipient_name text NOT NULL CHECK (length(trim(recipient_name)) BETWEEN 2 AND 180),
  recipient_tax_id text NOT NULL CHECK (recipient_tax_id ~ '^[0-9]{11}$|^[0-9]{14}$'),
  service_description text NOT NULL CHECK (length(trim(service_description)) BETWEEN 3 AND 2000),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','queued','issued','rejected','canceled')),
  access_key text,
  invoice_number text,
  official_pdf_url text,
  official_xml_url text,
  provider_response jsonb,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fiscal_invoices_user_created_idx
  ON public.fiscal_invoices (user_id, created_at DESC);
ALTER TABLE public.fiscal_invoices ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_invoices TO authenticated;
GRANT ALL ON public.fiscal_invoices TO service_role;
DROP POLICY IF EXISTS "users manage own fiscal invoice drafts" ON public.fiscal_invoices;
CREATE POLICY "users manage own fiscal invoice drafts"
  ON public.fiscal_invoices FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
