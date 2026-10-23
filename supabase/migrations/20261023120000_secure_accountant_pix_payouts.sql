-- Cadastro protegido de chave Pix e trilha auditável para pagamentos de comissões.
-- Não reativa cupons nem comissões: o programa de indicação permanece desligado até
-- uma implementação completa do fluxo de aquisição/cobrança ser aprovada e testada.

CREATE TABLE IF NOT EXISTS public.partner_payout_methods (
  partner_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pix_type text NOT NULL CHECK (pix_type IN ('cpf','cnpj','email','phone','random')),
  pix_key text NOT NULL,
  holder_name text NOT NULL CHECK (length(trim(holder_name)) BETWEEN 2 AND 160),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','rejected')),
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz,
  rejection_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_payout_methods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_payout_methods FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS partner_payout_methods_self_select ON public.partner_payout_methods;
CREATE POLICY partner_payout_methods_self_select ON public.partner_payout_methods
  FOR SELECT TO authenticated USING (partner_user_id = auth.uid());
-- No direct insert/update/delete: writes go through SECURITY DEFINER RPCs.

CREATE TABLE IF NOT EXISTS public.commission_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_user_id uuid NOT NULL REFERENCES auth.users(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','paid','rejected')),
  pix_type text NOT NULL CHECK (pix_type IN ('cpf','cnpj','email','phone','random')),
  pix_key_masked text NOT NULL,
  pix_holder_name text NOT NULL,
  admin_note text,
  receipt_path text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  paid_at timestamptz,
  external_transfer_reference text
);
ALTER TABLE public.commission_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commission_payouts FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS commission_payouts_partner_date_idx
  ON public.commission_payouts(partner_user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS commission_payouts_status_date_idx
  ON public.commission_payouts(status, requested_at ASC);

CREATE OR REPLACE FUNCTION public.save_my_pix_key(
  _pix_type text, _pix_key text, _holder_name text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE uid uuid := auth.uid(); normalized_type text := lower(trim(_pix_type));
        normalized_key text := trim(_pix_key); normalized_holder text := trim(_holder_name);
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_requests WHERE user_id = uid AND status = 'approved') THEN
    RAISE EXCEPTION 'approved accountant required';
  END IF;
  IF normalized_type NOT IN ('cpf','cnpj','email','phone','random')
     OR normalized_key = '' OR length(normalized_key) > 254
     OR normalized_holder NOT BETWEEN '' AND '' THEN
    -- Holder validation is kept separate to avoid locale-dependent comparisons.
    RAISE EXCEPTION 'invalid payout details';
  END IF;
  IF length(normalized_holder) < 2 OR length(normalized_holder) > 160 THEN
    RAISE EXCEPTION 'invalid holder name';
  END IF;
  IF NOT public.is_valid_pix_key(normalized_type, normalized_key) THEN
    RAISE EXCEPTION 'invalid Pix key';
  END IF;
  INSERT INTO public.partner_payout_methods(partner_user_id,pix_type,pix_key,holder_name,status,verified_by,verified_at,rejection_reason,updated_at)
  VALUES (uid,normalized_type,normalized_key,normalized_holder,'pending',NULL,NULL,NULL,now())
  ON CONFLICT (partner_user_id) DO UPDATE SET
    pix_type=EXCLUDED.pix_type, pix_key=EXCLUDED.pix_key, holder_name=EXCLUDED.holder_name,
    status='pending', verified_by=NULL, verified_at=NULL, rejection_reason=NULL, updated_at=now();
  RETURN jsonb_build_object('status','pending','pix_type',normalized_type,
    'pix_key_masked', CASE normalized_type
      WHEN 'email' THEN left(normalized_key,1) || '***' || substring(normalized_key from position('@' in normalized_key))
      WHEN 'phone' THEN '***' || right(regexp_replace(normalized_key,'\\D','','g'),4)
      WHEN 'cpf' THEN '***.***.***-' || right(regexp_replace(normalized_key,'\\D','','g'),2)
      WHEN 'cnpj' THEN '**.***.***/****-' || right(regexp_replace(normalized_key,'\\D','','g'),2)
      ELSE '••••' || right(normalized_key,4) END,
    'holder_name',normalized_holder);
END;
$$;
REVOKE ALL ON FUNCTION public.save_my_pix_key(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_pix_key(text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_pix_payout_status()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE uid uuid := auth.uid(); result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT jsonb_build_object('pix_type',pix_type,'pix_key_masked',
    CASE pix_type
      WHEN 'email' THEN left(pix_key,1) || '***' || substring(pix_key from position('@' in pix_key))
      WHEN 'phone' THEN '***' || right(regexp_replace(pix_key,'\\D','','g'),4)
      WHEN 'cpf' THEN '***.***.***-' || right(regexp_replace(pix_key,'\\D','','g'),2)
      WHEN 'cnpj' THEN '**.***.***/****-' || right(regexp_replace(pix_key,'\\D','','g'),2)
      ELSE '••••' || right(pix_key,4) END,
    'holder_name',holder_name,'status',status,'rejection_reason',rejection_reason,'updated_at',updated_at)
  INTO result FROM public.partner_payout_methods WHERE partner_user_id=uid;
  RETURN COALESCE(result,'{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.my_pix_payout_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_pix_payout_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_review_partner_pix(
  _partner_user_id uuid, _approve boolean, _reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN
    RAISE EXCEPTION 'admin access required';
  END IF;
  UPDATE public.partner_payout_methods SET
    status=CASE WHEN _approve THEN 'verified' ELSE 'rejected' END,
    verified_by=auth.uid(), verified_at=CASE WHEN _approve THEN now() ELSE NULL END,
    rejection_reason=CASE WHEN _approve THEN NULL ELSE left(trim(COALESCE(_reason,'Dados Pix não aprovados')),500) END,
    updated_at=now()
  WHERE partner_user_id=_partner_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pix payout profile not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_review_partner_pix(uuid,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_partner_pix(uuid,boolean,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_pix_payout_queue()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN
    RAISE EXCEPTION 'admin access required';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'partner_user_id',m.partner_user_id,'full_name',pr.full_name,'email',pr.email,
    'pix_type',m.pix_type,'pix_key',m.pix_key,'holder_name',m.holder_name,'pix_status',m.status,
    'rejection_reason',m.rejection_reason,'updated_at',m.updated_at
  ) ORDER BY m.updated_at ASC),'[]'::jsonb) INTO result
  FROM public.partner_payout_methods m
  JOIN public.partner_requests pr ON pr.user_id=m.partner_user_id
  WHERE pr.status='approved';
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_pix_payout_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pix_payout_queue() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_record_commission_payout(
  _partner_user_id uuid, _amount_cents bigint, _admin_note text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE payout_id uuid; method public.partner_payout_methods%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN
    RAISE EXCEPTION 'admin access required';
  END IF;
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN RAISE EXCEPTION 'invalid payout amount'; END IF;
  SELECT * INTO method FROM public.partner_payout_methods WHERE partner_user_id=_partner_user_id FOR UPDATE;
  IF NOT FOUND OR method.status <> 'verified' THEN RAISE EXCEPTION 'verified Pix key required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_requests WHERE user_id=_partner_user_id AND status='approved') THEN
    RAISE EXCEPTION 'approved accountant required';
  END IF;
  INSERT INTO public.commission_payouts(partner_user_id,amount_cents,status,pix_type,pix_key_masked,pix_holder_name,admin_note)
  VALUES (_partner_user_id,_amount_cents,'approved',method.pix_type,
    CASE method.pix_type
      WHEN 'email' THEN left(method.pix_key,1) || '***' || substring(method.pix_key from position('@' in method.pix_key))
      WHEN 'phone' THEN '***' || right(regexp_replace(method.pix_key,'\\D','','g'),4)
      WHEN 'cpf' THEN '***.***.***-' || right(regexp_replace(method.pix_key,'\\D','','g'),2)
      WHEN 'cnpj' THEN '**.***.***/****-' || right(regexp_replace(method.pix_key,'\\D','','g'),2)
      ELSE '••••' || right(method.pix_key,4) END,
    method.holder_name,left(COALESCE(_admin_note,''),1000))
  RETURNING id INTO payout_id;
  RETURN payout_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_record_commission_payout(uuid,bigint,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_record_commission_payout(uuid,bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_confirm_commission_payout(
  _payout_id uuid, _transfer_reference text, _receipt_path text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role='admin') THEN
    RAISE EXCEPTION 'admin access required';
  END IF;
  IF NULLIF(trim(_transfer_reference),'') IS NULL OR NULLIF(trim(_receipt_path),'') IS NULL THEN
    RAISE EXCEPTION 'transfer reference and receipt are required';
  END IF;
  UPDATE public.commission_payouts SET status='paid', paid_at=now(), reviewed_by=auth.uid(),
    reviewed_at=now(), external_transfer_reference=left(trim(_transfer_reference),200),
    receipt_path=left(trim(_receipt_path),500)
  WHERE id=_payout_id AND status='approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'approved payout not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_confirm_commission_payout(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_commission_payout(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_commission_payout_history()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE uid uuid := auth.uid(); result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'amount_cents',amount_cents,'status',status,
    'pix_type',pix_type,'pix_key_masked',pix_key_masked,'pix_holder_name',pix_holder_name,
    'requested_at',requested_at,'paid_at',paid_at,'receipt_path',receipt_path,
    'external_transfer_reference',external_transfer_reference,'admin_note',admin_note)
    ORDER BY requested_at DESC),'[]'::jsonb)
  INTO result FROM public.commission_payouts WHERE partner_user_id=uid;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.my_commission_payout_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_commission_payout_history() TO authenticated;
