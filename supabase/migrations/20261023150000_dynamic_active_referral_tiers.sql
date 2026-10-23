-- Recalculate the rate for FUTURE referrals from active, paid referred customers.
-- A referral's stored affiliate_commission_percent and existing commission rows are
-- intentionally not rewritten when a partner's tier changes.
CREATE OR REPLACE FUNCTION public.sync_partner_coupon_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  affected_partner uuid;
  active_clients integer := 0;
  next_referral_rate integer := 20;
  partner_is_approved boolean := false;
BEGIN
  FOR affected_partner IN
    SELECT DISTINCT candidate.partner_id
    FROM (
      SELECT CASE WHEN TG_OP <> 'INSERT' THEN OLD.affiliate_partner_id ELSE NULL::uuid END AS partner_id
      UNION ALL
      SELECT CASE WHEN TG_OP <> 'DELETE' THEN NEW.affiliate_partner_id ELSE NULL::uuid END AS partner_id
    ) candidate
    WHERE candidate.partner_id IS NOT NULL
  LOOP
    SELECT count(DISTINCT s.user_id)::integer
      INTO active_clients
    FROM public.subscriptions s
    WHERE s.affiliate_partner_id = affected_partner
      AND s.status = 'active'
      AND s.paid_at IS NOT NULL;

    -- Tier applies to the next acquisition:
    -- referrals 1-5: 20%; 6-15: 25%; 16+: 30%.
    next_referral_rate := CASE
      WHEN active_clients <= 5 THEN 20
      WHEN active_clients <= 15 THEN 25
      ELSE 30
    END;

    SELECT COALESCE(bool_or(pr.status = 'approved'), false)
      INTO partner_is_approved
    FROM public.partner_requests pr
    WHERE pr.id = affected_partner;

    UPDATE public.coupons c
       SET commission_percent = next_referral_rate,
           discount_percent = 20,
           is_active = partner_is_approved,
           updated_at = now()
     WHERE c.partner_id = affected_partner;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS refresh_partner_tier_after_subscription_change ON public.subscriptions;
CREATE TRIGGER refresh_partner_tier_after_subscription_change
AFTER INSERT OR DELETE OR UPDATE OF status, paid_at, affiliate_partner_id
ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.sync_partner_coupon_rate();
