-- Keep the green receipt status restricted to an explicitly authorized accountant review.
CREATE OR REPLACE FUNCTION public.enforce_receipt_audit_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.receipt_status = 'matched' THEN
    IF NEW.receipt_path IS NULL OR NEW.receipt_amount_cents IS NULL
       OR NEW.receipt_amount_cents <> NEW.amount_cents
       OR NEW.receipt_reviewed_by IS DISTINCT FROM auth.uid()
       OR NOT EXISTS (
         SELECT 1
         FROM public.accountant_access aa
         JOIN public.partner_requests pr ON pr.id = aa.partner_id
         WHERE aa.client_user_id = NEW.user_id
           AND pr.user_id = auth.uid()
           AND pr.status = 'approved'
       ) THEN
      RAISE EXCEPTION 'RECEIPT_REVIEW_REQUIRED: only an authorized accountant can confirm a matching receipt with the exact amount';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_receipt_audit_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS entries_enforce_receipt_audit_status ON public.entries;
CREATE TRIGGER entries_enforce_receipt_audit_status
BEFORE UPDATE OF receipt_status ON public.entries
FOR EACH ROW
EXECUTE FUNCTION public.enforce_receipt_audit_status();

CREATE OR REPLACE FUNCTION public.review_financial_receipt(
  _entry_id uuid, _status text, _receipt_amount_cents bigint, _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  uid uuid := auth.uid();
  expected_amount bigint;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _status NOT IN ('pending', 'matched', 'mismatch') THEN
    RAISE EXCEPTION 'invalid receipt review status';
  END IF;
  IF _status = 'matched' AND (_receipt_amount_cents IS NULL OR _receipt_amount_cents <= 0) THEN
    RAISE EXCEPTION 'receipt amount is required to mark a receipt as matched';
  END IF;

  SELECT e.amount_cents INTO expected_amount
  FROM public.entries e
  WHERE e.id = _entry_id
    AND e.receipt_path IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.accountant_access aa
      JOIN public.partner_requests pr ON pr.id = aa.partner_id
      WHERE aa.client_user_id = e.user_id
        AND pr.user_id = uid
        AND pr.status = 'approved'
    );

  IF expected_amount IS NULL THEN
    RAISE EXCEPTION 'receipt not found or accountant access not authorized';
  END IF;
  IF _status = 'matched' AND _receipt_amount_cents <> expected_amount THEN
    RAISE EXCEPTION 'RECEIPT_AMOUNT_MISMATCH: the receipt amount must exactly match the financial entry';
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
      SELECT 1
      FROM public.accountant_access aa
      JOIN public.partner_requests pr ON pr.id = aa.partner_id
      WHERE aa.client_user_id = e.user_id
        AND pr.user_id = uid
        AND pr.status = 'approved'
    );
  IF NOT FOUND THEN RAISE EXCEPTION 'receipt not found or accountant access not authorized'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.review_financial_receipt(uuid, text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_financial_receipt(uuid, text, bigint, text) TO authenticated;
