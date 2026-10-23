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
  affected_partners uuid[];
  active_clients integer := 0;
  next_referral_rate integer := 20;
  partner_is_approved boolean := false;
BEGIN
  -- Handle each operation explicitly: NEW is not available for DELETE and OLD
  -- is not available for INSERT.
  IF TG_OP = 'INSERT' THEN
    affected_partners := ARRAY[NEW.affiliate_partner_id];
  ELSIF TG_OP = 'DELETE' THEN
    affected_partners := ARRAY[OLD.affiliate_partner_id];
  ELSE
    affected_partners := ARRAY[OLD.affiliate_partner_id, NEW.affiliate_partner_id];
  END IF;

  FOR affected_partner IN
    SELECT DISTINCT candidate.partner_id
    FROM unnest(affected_partners) AS candidate(partner_id)
    WHERE candidate.partner_id IS NOT NULL
  LOOP
    SELECT count(DISTINCT s.user_id)::integer
      INTO active_clients
    FROM public.subscriptions s
    WHERE s.affiliate_partner_id = affected_partner
      AND s.status = 'active'
      AND s.paid_at IS NOT NULL;

    -- Current active-client tier determines the rate for FUTURE referrals:
    -- 1-5 active clients: 20%; 6-15: 25%; 16+: 30%.
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

-- Replace the previous trigger instead of leaving duplicate recalculations.
DROP TRIGGER IF EXISTS refresh_partner_tier_after_subscription_change ON public.subscriptions;
DROP TRIGGER IF EXISTS subscriptions_sync_partner_coupon_rate ON public.subscriptions;
CREATE TRIGGER subscriptions_sync_partner_coupon_rate
AFTER INSERT OR DELETE OR UPDATE OF status, paid_at, affiliate_partner_id
ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.sync_partner_coupon_rate();

-- Reconcile existing coupons immediately, without waiting for a subscription event.
DO $$
DECLARE
  partner_row record;
  active_clients integer;
  next_referral_rate integer;
BEGIN
  FOR partner_row IN
    SELECT c.partner_id, c.id AS coupon_id, pr.status AS partner_status
    FROM public.coupons c
    LEFT JOIN public.partner_requests pr ON pr.id = c.partner_id
  LOOP
    SELECT count(DISTINCT s.user_id)::integer
      INTO active_clients
    FROM public.subscriptions s
    WHERE s.affiliate_partner_id = partner_row.partner_id
      AND s.status = 'active'
      AND s.paid_at IS NOT NULL;

    next_referral_rate := CASE
      WHEN active_clients <= 5 THEN 20
      WHEN active_clients <= 15 THEN 25
      ELSE 30
    END;

    UPDATE public.coupons
       SET commission_percent = next_referral_rate,
           discount_percent = 20,
           is_active = COALESCE(partner_row.partner_status = 'approved', false),
           updated_at = now()
     WHERE id = partner_row.coupon_id;
  END LOOP;
END
$$;
