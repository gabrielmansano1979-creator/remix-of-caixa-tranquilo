-- Reativa o programa de indicação com proteções e pagamento auditável.
-- A cobrança precisa ser confirmada pelo webhook do Asaas antes de gerar comissão.
DROP TRIGGER IF EXISTS coupons_disable_accountant_affiliate ON public.coupons;
DROP TRIGGER IF EXISTS subscriptions_strip_accountant_affiliate ON public.subscriptions;
DROP TRIGGER IF EXISTS pending_billing_strip_accountant_affiliate ON public.pending_billing_changes;
DROP TRIGGER IF EXISTS commissions_prevent_new_accountant_commissions ON public.commissions;

-- Mantém as funções antigas inofensivas caso alguma instalação ainda as referencie.
CREATE OR REPLACE FUNCTION public.disable_accountant_affiliate_coupons()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$ BEGIN RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.strip_accountant_affiliate_attribution()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$ BEGIN RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.prevent_new_accountant_commissions()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$ BEGIN RETURN NEW; END; $$;

-- Um código único e um desconto de 20% por contador aprovado.
DO $$
DECLARE partner record;
BEGIN
  FOR partner IN SELECT id FROM public.partner_requests WHERE status = 'approved'
  LOOP
    UPDATE public.coupons
       SET is_active = true, discount_percent = 20, updated_at = now()
     WHERE partner_id = partner.id;
    IF NOT FOUND THEN
      INSERT INTO public.coupons(partner_id, code, discount_percent, commission_percent, is_active, created_at, updated_at)
      VALUES (partner.id, 'CC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), 20, 20, true, now(), now())
      ON CONFLICT (code) DO NOTHING;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_partner_status(_partner_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE partner_record_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin access required';
  END IF;
  IF _status NOT IN ('pending_approval', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  UPDATE public.partner_requests SET status = _status, updated_at = now()
   WHERE user_id = _partner_id RETURNING id INTO partner_record_id;
  IF partner_record_id IS NULL THEN RAISE EXCEPTION 'partner not found'; END IF;
  IF _status = 'approved' THEN
    UPDATE public.coupons SET is_active = true, discount_percent = 20, updated_at = now()
     WHERE partner_id = partner_record_id;
    IF NOT FOUND THEN
      INSERT INTO public.coupons(partner_id, code, discount_percent, commission_percent, is_active, created_at, updated_at)
      VALUES (partner_record_id, 'CC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)), 20, 20, true, now(), now());
    END IF;
  ELSE
    UPDATE public.coupons SET is_active = false, updated_at = now() WHERE partner_id = partner_record_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_partner_status(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_partner_status(uuid,text) TO authenticated;

-- Só usuários autenticados com papel admin podem acessar o comprovante privado.
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('commission-payout-receipts', 'commission-payout-receipts', false, 10485760,
        ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png','image/webp'];

DROP POLICY IF EXISTS commission_receipts_admin_select ON storage.objects;
CREATE POLICY commission_receipts_admin_select ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'commission-payout-receipts'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
DROP POLICY IF EXISTS commission_receipts_admin_insert ON storage.objects;
CREATE POLICY commission_receipts_admin_insert ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'commission-payout-receipts'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
DROP POLICY IF EXISTS commission_receipts_admin_update ON storage.objects;
CREATE POLICY commission_receipts_admin_update ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'commission-payout-receipts'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  ) WITH CHECK (
    bucket_id = 'commission-payout-receipts'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );
DROP POLICY IF EXISTS commission_receipts_admin_delete ON storage.objects;
CREATE POLICY commission_receipts_admin_delete ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'commission-payout-receipts'
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.admin_approve_commission(_commission_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'admin access required'; END IF;
  UPDATE public.commissions SET status = 'available'
   WHERE id = _commission_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'pending commission not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_approve_commission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_approve_commission(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_commission_payouts_queue()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'admin access required'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', cp.id, 'partner_user_id', cp.partner_user_id, 'partner_name', pr.full_name,
    'partner_email', pr.email, 'amount_cents', cp.amount_cents, 'status', cp.status,
    'requested_at', cp.requested_at, 'paid_at', cp.paid_at,
    'external_transfer_reference', cp.external_transfer_reference, 'receipt_path', cp.receipt_path,
    'admin_note', cp.admin_note
  ) ORDER BY cp.requested_at DESC), '[]'::jsonb)
  INTO result
  FROM public.commission_payouts cp
  LEFT JOIN public.partner_requests pr ON pr.user_id = cp.partner_user_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.admin_commission_payouts_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_commission_payouts_queue() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_partner_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE uid uuid := auth.uid(); result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT jsonb_build_object(
    'status', COALESCE(pr.status, 'none'),
    'full_name', pr.full_name,
    'tax_id', pr.tax_id,
    'crc_number', pr.crc_number,
    'pix_type', pr.pix_type,
    'pix_key', pr.pix_key,
    'coupon', (
      SELECT jsonb_build_object('code', c.code, 'discount_percent', c.discount_percent, 'commission_percent', c.commission_percent)
      FROM public.coupons c WHERE c.partner_id = pr.id AND c.is_active LIMIT 1
    )
  ) INTO result
  FROM (SELECT 1) source
  LEFT JOIN public.partner_requests pr ON pr.user_id = uid;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.my_partner_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_partner_status() TO authenticated;
