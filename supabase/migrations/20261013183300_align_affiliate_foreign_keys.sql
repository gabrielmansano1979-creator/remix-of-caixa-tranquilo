-- Align foreign keys with the active affiliate code, which stores partner_requests.id
-- in coupons, commissions, subscriptions.affiliate_partner_id and accountant_access.partner_id.
-- Linked rows were checked before applying this correction.
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_partner_id_fkey;
ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES public.partner_requests(id) ON DELETE CASCADE;

ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_partner_id_fkey;
ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES public.partner_requests(id) ON DELETE CASCADE;

ALTER TABLE public.accountant_access DROP CONSTRAINT IF EXISTS accountant_access_partner_id_fkey;
ALTER TABLE public.accountant_access
  ADD CONSTRAINT accountant_access_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES public.partner_requests(id) ON DELETE CASCADE;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_affiliate_partner_id_fkey;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_affiliate_partner_id_fkey
  FOREIGN KEY (affiliate_partner_id) REFERENCES public.partner_requests(id) ON DELETE SET NULL;

ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_subscription_id_fkey;
ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_subscription_id_fkey
  FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;

-- Application code uses upsert(..., { onConflict: "user_id" }) for subscriptions.
-- Duplicate user IDs were checked before creating this unique index.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_unique
  ON public.subscriptions(user_id);

-- Trigger functions are invoked by PostgreSQL triggers, not exposed as RPC endpoints.
REVOKE ALL ON FUNCTION public.enforce_entry_write_entitlement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_profile_finance_entitlement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_reminder_rule_entitlement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_partner_coupon_rate() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_entry_write_entitlement() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_profile_finance_entitlement() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_reminder_rule_entitlement() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_partner_coupon_rate() TO service_role;

CREATE INDEX IF NOT EXISTS accountant_invites_owner_user_id_idx ON public.accountant_invites(owner_user_id);
CREATE INDEX IF NOT EXISTS commissions_partner_id_idx ON public.commissions(partner_id);
CREATE INDEX IF NOT EXISTS commissions_subscription_id_idx ON public.commissions(subscription_id);
CREATE INDEX IF NOT EXISTS subscriptions_partner_id_idx ON public.subscriptions(partner_id);
CREATE INDEX IF NOT EXISTS reminder_logs_rule_id_idx ON public.reminder_logs(rule_id);
CREATE INDEX IF NOT EXISTS reminder_logs_stage_rule_id_idx ON public.reminder_logs(stage_rule_id);

-- Payout changes require an authenticated user; do not expose this SECURITY DEFINER RPC to anon.
REVOKE ALL ON FUNCTION public.update_partner_payout(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_partner_payout(text, text) TO authenticated, service_role;
