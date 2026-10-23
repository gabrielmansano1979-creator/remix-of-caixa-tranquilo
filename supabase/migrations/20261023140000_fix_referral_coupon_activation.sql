-- A chave Pix é requisito para saque, não para atribuir clientes indicados.
-- O método de pagamento fica separado em partner_payout_methods; não exigir
-- os campos Pix legados de partner_requests para manter o link de indicação ativo.
CREATE OR REPLACE FUNCTION public.sync_partner_coupon_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected_partner uuid;
  confirmed_clients integer := 0;
  next_referral_rate integer := 20;
  partner_is_approved boolean := false;
BEGIN
  FOR affected_partner IN
    SELECT affected.partner_id
    FROM (
      SELECT CASE WHEN TG_OP = 'UPDATE' THEN OLD.affiliate_partner_id ELSE NULL::uuid END AS partner_id
      UNION
      SELECT NEW.affiliate_partner_id AS partner_id
    ) affected
    WHERE affected.partner_id IS NOT NULL
  LOOP
    SELECT count(DISTINCT s.user_id)::integer INTO confirmed_clients
    FROM public.subscriptions s
    WHERE s.affiliate_partner_id = affected_partner
      AND s.paid_at IS NOT NULL;

    -- Faixa aplicada à próxima indicação: após 5 clientes pagos passa a 25%;
    -- após 15 clientes pagos passa a 30%. As comissões já gravadas não mudam.
    next_referral_rate := CASE
      WHEN confirmed_clients < 5 THEN 20
      WHEN confirmed_clients < 15 THEN 25
      ELSE 30
    END;

    SELECT (pr.status = 'approved') INTO partner_is_approved
    FROM public.partner_requests pr
    WHERE pr.id = affected_partner;

    UPDATE public.coupons c
    SET commission_percent = next_referral_rate,
        discount_percent = 20,
        is_active = COALESCE(partner_is_approved, false),
        updated_at = now()
    WHERE c.partner_id = affected_partner;
  END LOOP;
  RETURN NEW;
END
$$;
