-- Private receipt attachments and per-entry audit traffic lights.
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS receipt_path text,
  ADD COLUMN IF NOT EXISTS receipt_status text NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS receipt_amount_cents bigint,
  ADD COLUMN IF NOT EXISTS receipt_review_note text,
  ADD COLUMN IF NOT EXISTS receipt_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_receipt_status_check;
ALTER TABLE public.entries ADD CONSTRAINT entries_receipt_status_check
  CHECK (receipt_status IN ('missing', 'pending', 'matched', 'mismatch'));

CREATE OR REPLACE FUNCTION public.reset_receipt_audit_on_entry_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.receipt_path IS NULL OR btrim(NEW.receipt_path) = '' THEN
    NEW.receipt_path := NULL;
    NEW.receipt_status := 'missing';
    NEW.receipt_amount_cents := NULL;
    NEW.receipt_review_note := NULL;
    NEW.receipt_reviewed_at := NULL;
    NEW.receipt_reviewed_by := NULL;
  ELSIF TG_OP = 'INSERT' OR OLD.receipt_path IS DISTINCT FROM NEW.receipt_path
     OR (TG_OP = 'UPDATE' AND (OLD.amount_cents IS DISTINCT FROM NEW.amount_cents OR OLD.type IS DISTINCT FROM NEW.type)) THEN
    NEW.receipt_status := 'pending';
    NEW.receipt_amount_cents := NULL;
    NEW.receipt_review_note := NULL;
    NEW.receipt_reviewed_at := NULL;
    NEW.receipt_reviewed_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.reset_receipt_audit_on_entry_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS entries_reset_receipt_audit ON public.entries;
CREATE TRIGGER entries_reset_receipt_audit
BEFORE INSERT OR UPDATE OF receipt_path, amount_cents, type ON public.entries
FOR EACH ROW EXECUTE FUNCTION public.reset_receipt_audit_on_entry_change();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('critical-cash-receipts', 'critical-cash-receipts', false, 10485760,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS critical_cash_receipts_owner_insert ON storage.objects;
CREATE POLICY critical_cash_receipts_owner_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'critical-cash-receipts'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

DROP POLICY IF EXISTS critical_cash_receipts_owner_or_accountant_read ON storage.objects;
CREATE POLICY critical_cash_receipts_owner_or_accountant_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'critical-cash-receipts'
  AND (
    (storage.foldername(name))[1] = (SELECT auth.uid())::text
    OR EXISTS (
      SELECT 1
      FROM public.entries e
      JOIN public.accountant_access aa ON aa.client_user_id = e.user_id
      JOIN public.partner_requests pr ON pr.id = aa.partner_id AND pr.user_id = (SELECT auth.uid()) AND pr.status = 'approved'
      WHERE e.id::text = (storage.foldername(name))[2]
        AND e.user_id::text = (storage.foldername(name))[1]
    )
  )
);

DROP POLICY IF EXISTS critical_cash_receipts_owner_delete ON storage.objects;
CREATE POLICY critical_cash_receipts_owner_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'critical-cash-receipts'
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

CREATE OR REPLACE FUNCTION public.my_accountant_receipt_audit()
RETURNS TABLE (
  entry_id uuid, client_user_id uuid, client_name text, client_whatsapp text,
  description text, entry_type text, amount_cents bigint, due_date date,
  receipt_path text, receipt_status text, receipt_amount_cents bigint,
  receipt_review_note text, receipt_reviewed_at timestamptz, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_requests pr WHERE pr.user_id = uid AND pr.status = 'approved') THEN
    RAISE EXCEPTION 'approved accountant registration required';
  END IF;
  RETURN QUERY
  SELECT e.id, p.user_id,
    COALESCE(NULLIF(btrim(p.business_name), ''), NULLIF(btrim(p.full_name), ''), 'Empresa'),
    p.notification_whatsapp, e.description, e.type::text, e.amount_cents, e.due_date,
    e.receipt_path, e.receipt_status, e.receipt_amount_cents, e.receipt_review_note,
    e.receipt_reviewed_at, e.created_at
  FROM public.entries e
  JOIN public.profiles p ON p.user_id = e.user_id
  JOIN public.accountant_access aa ON aa.client_user_id = e.user_id
  JOIN public.partner_requests pr ON pr.id = aa.partner_id AND pr.user_id = uid AND pr.status = 'approved'
  ORDER BY (e.receipt_status = 'missing') DESC, (e.receipt_status = 'mismatch') DESC, e.due_date, e.created_at;
END;
$$;
REVOKE ALL ON FUNCTION public.my_accountant_receipt_audit() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_accountant_receipt_audit() TO authenticated;

CREATE OR REPLACE FUNCTION public.review_financial_receipt(
  _entry_id uuid, _status text, _receipt_amount_cents bigint, _note text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _status NOT IN ('pending','matched','mismatch') THEN RAISE EXCEPTION 'invalid receipt review status'; END IF;
  IF _status = 'matched' AND (_receipt_amount_cents IS NULL OR _receipt_amount_cents <= 0) THEN
    RAISE EXCEPTION 'receipt amount is required to mark a receipt as matched';
  END IF;
  UPDATE public.entries e
  SET receipt_status = _status,
      receipt_amount_cents = _receipt_amount_cents,
      receipt_review_note = NULLIF(left(btrim(COALESCE(_note, '')), 500), ''),
      receipt_reviewed_at = CASE WHEN _status = 'pending' THEN NULL ELSE now() END,
      receipt_reviewed_by = CASE WHEN _status = 'pending' THEN NULL ELSE uid END
  WHERE e.id = _entry_id
    AND e.receipt_path IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.accountant_access aa
      JOIN public.partner_requests pr ON pr.id = aa.partner_id
      WHERE aa.client_user_id = e.user_id AND pr.user_id = uid AND pr.status = 'approved'
    );
  IF NOT FOUND THEN RAISE EXCEPTION 'receipt not found or accountant access not authorized'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.review_financial_receipt(uuid, text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_financial_receipt(uuid, text, bigint, text) TO authenticated;
