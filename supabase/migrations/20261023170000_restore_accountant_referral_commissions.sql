-- Restore the accountant referral program. The earlier retirement migration left
-- BEFORE triggers that silently stripped referral attribution and suppressed every
-- new commission row, even after the tier/checkout fixes were merged.
BEGIN;

-- Re-enable approved accountant coupons and allow referral attribution to persist.
DROP TRIGGER IF EXISTS coupons_disable_accountant_affiliate ON public.coupons;
DROP TRIGGER IF EXISTS subscriptions_strip_accountant_affiliate ON public.subscriptions;
DROP TRIGGER IF EXISTS pending_billing_strip_accountant_affiliate ON public.pending_billing_changes;

-- New commission rows are created by the verified Asaas payment webhook.
DROP TRIGGER IF EXISTS commissions_prevent_new_accountant_commissions ON public.commissions;

-- Reconcile existing coupons to the approved partner state and the current active,
-- paid customer tier. Historical commission rows and customer acquisition snapshots
-- are deliberately not rewritten.
WITH referral_counts AS (
  SELECT s.affiliate_partner_id AS partner_id,
         count(DISTINCT s.user_id)::integer AS active_clients
  FROM public.subscriptions s
  WHERE s.affiliate_partner_id IS NOT NULL
    AND s.status = 'active'
    AND s.paid_at IS NOT NULL
  GROUP BY s.affiliate_partner_id
)
UPDATE public.coupons c
SET commission_percent = CASE
      WHEN COALESCE(rc.active_clients, 0) <= 5 THEN 20
      WHEN rc.active_clients <= 15 THEN 25
      ELSE 30
    END,
    discount_percent = 20,
    is_active = (pr.status = 'approved'),
    updated_at = now()
FROM public.partner_requests pr
LEFT JOIN referral_counts rc ON rc.partner_id = pr.id
WHERE c.partner_id = pr.id;

COMMENT ON FUNCTION public.prevent_new_accountant_commissions() IS
  'Legacy no-op function retained for migration compatibility; its blocking trigger is removed.';

NOTIFY pgrst, 'reload schema';
COMMIT;
