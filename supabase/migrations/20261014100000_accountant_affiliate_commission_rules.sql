-- Accountant affiliate program: 20% customer discount and commission tiers.
-- The affiliate commission is calculated from the actual amount collected by Asaas after discounts.

ALTER TABLE public.coupons
  DROP CONSTRAINT IF EXISTS coupons_discount_percent_check;

UPDATE public.coupons
SET discount_percent = 20,
    updated_at = now();

ALTER TABLE public.coupons
  ALTER COLUMN discount_percent SET DEFAULT 20;

ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_discount_percent_check CHECK (discount_percent = 20);

-- Keep every future coupon insert/update at 20% discount, including writes made by
-- existing SECURITY DEFINER partner approval and payout functions.
CREATE OR REPLACE FUNCTION public.enforce_accountant_coupon_discount()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public, pg_temp
AS $function$
BEGIN
  NEW.discount_percent := 20;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS coupons_enforce_accountant_discount ON public.coupons;
CREATE TRIGGER coupons_enforce_accountant_discount
BEFORE INSERT OR UPDATE OF discount_percent ON public.coupons
FOR EACH ROW
EXECUTE FUNCTION public.enforce_accountant_coupon_discount();

REVOKE ALL ON FUNCTION public.enforce_accountant_coupon_discount() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_accountant_coupon_discount() TO service_role;

-- Keep the rate calculation explicit and automatic: 1-5 = 20%, 6-15 = 25%,
-- 16-30 = 30%, and 31+ remains at 30%. Count unique clients with confirmed payments.
CREATE OR REPLACE FUNCTION public.sync_partner_coupon_rate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  affected_partner uuid;
  confirmed_clients integer := 0;
  payout_rate integer := 20;
  payout_is_ready boolean := false;
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

    payout_rate := CASE
      WHEN confirmed_clients <= 5 THEN 20
      WHEN confirmed_clients <= 15 THEN 25
      ELSE 30
    END;

    SELECT
      pr.status = 'approved'
      AND public.is_valid_pix_key(pr.pix_type, pr.pix_key)
    INTO payout_is_ready
    FROM public.partner_requests pr
    WHERE pr.id = affected_partner;

    UPDATE public.coupons c
    SET commission_percent = payout_rate,
        discount_percent = 20,
        is_active = COALESCE(payout_is_ready, false),
        updated_at = now()
    WHERE c.partner_id = affected_partner;
  END LOOP;

  RETURN NEW;
END
$function$;

-- Existing rows are recalculated from the latest count of unique paying referrals.
WITH partner_rates AS (
  SELECT
    pr.id AS partner_id,
    count(DISTINCT s.user_id) FILTER (WHERE s.paid_at IS NOT NULL)::integer AS confirmed_clients
  FROM public.partner_requests pr
  LEFT JOIN public.subscriptions s ON s.affiliate_partner_id = pr.id
  GROUP BY pr.id
)
UPDATE public.coupons c
SET commission_percent = CASE
      WHEN p.confirmed_clients <= 5 THEN 20
      WHEN p.confirmed_clients <= 15 THEN 25
      ELSE 30
    END,
    discount_percent = 20,
    updated_at = now()
FROM partner_rates p
WHERE p.partner_id = c.partner_id;
