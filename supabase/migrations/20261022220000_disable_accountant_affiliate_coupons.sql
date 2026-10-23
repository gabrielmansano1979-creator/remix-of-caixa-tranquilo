-- Retire o programa de cupons/comissões de contadores. A Auditoria Livre continua
-- disponível após aprovação profissional e autorização explícita de cada cliente.
-- Não apagamos o histórico financeiro de comissões já registradas.
CREATE OR REPLACE FUNCTION public.disable_accountant_affiliate_coupons()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.is_active := false;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.disable_accountant_affiliate_coupons() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS coupons_disable_accountant_affiliate ON public.coupons;
CREATE TRIGGER coupons_disable_accountant_affiliate
BEFORE INSERT OR UPDATE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION public.disable_accountant_affiliate_coupons();

UPDATE public.coupons
SET is_active = false, updated_at = now()
WHERE is_active IS DISTINCT FROM false;

-- Apaga a atribuição comercial de novas cobranças e assinaturas existentes para
-- impedir que webhooks atrasados continuem calculando comissão de afiliado.
UPDATE public.pending_billing_changes
SET affiliate_partner_id = NULL,
    affiliate_coupon_code = NULL,
    affiliate_commission_percent = NULL,
    affiliate_discount_percent = NULL,
    updated_at = now()
WHERE affiliate_partner_id IS NOT NULL
   OR affiliate_coupon_code IS NOT NULL
   OR affiliate_commission_percent IS NOT NULL
   OR affiliate_discount_percent IS NOT NULL;

UPDATE public.subscriptions
SET affiliate_partner_id = NULL,
    affiliate_coupon_code = NULL,
    affiliate_commission_percent = NULL,
    affiliate_discount_percent = NULL,
    updated_at = now()
WHERE affiliate_partner_id IS NOT NULL
   OR affiliate_coupon_code IS NOT NULL
   OR affiliate_commission_percent IS NOT NULL
   OR affiliate_discount_percent IS NOT NULL;

CREATE OR REPLACE FUNCTION public.strip_accountant_affiliate_attribution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.affiliate_partner_id := NULL;
  NEW.affiliate_coupon_code := NULL;
  NEW.affiliate_commission_percent := NULL;
  NEW.affiliate_discount_percent := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.strip_accountant_affiliate_attribution() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS subscriptions_strip_accountant_affiliate ON public.subscriptions;
CREATE TRIGGER subscriptions_strip_accountant_affiliate
BEFORE INSERT OR UPDATE ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.strip_accountant_affiliate_attribution();

DROP TRIGGER IF EXISTS pending_billing_strip_accountant_affiliate ON public.pending_billing_changes;
CREATE TRIGGER pending_billing_strip_accountant_affiliate
BEFORE INSERT OR UPDATE ON public.pending_billing_changes
FOR EACH ROW EXECUTE FUNCTION public.strip_accountant_affiliate_attribution();

COMMENT ON FUNCTION public.disable_accountant_affiliate_coupons() IS
  'Critical Cash: keep accountant affiliate coupons disabled; the accountant audit service is not an affiliate program.';
COMMENT ON FUNCTION public.strip_accountant_affiliate_attribution() IS
  'Critical Cash: remove affiliate discount/commission attribution from new and updated billing records.';

-- Bloqueia qualquer comissão nova, inclusive se um webhook antigo já tiver lido
-- uma cobrança antes desta migração. O histórico existente é preservado.
CREATE OR REPLACE FUNCTION public.prevent_new_accountant_commissions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_new_accountant_commissions() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS commissions_prevent_new_accountant_commissions ON public.commissions;
CREATE TRIGGER commissions_prevent_new_accountant_commissions
BEFORE INSERT ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.prevent_new_accountant_commissions();

COMMENT ON FUNCTION public.prevent_new_accountant_commissions() IS
  'Critical Cash: no new affiliate commissions are created after the accountant affiliate program is retired.';
