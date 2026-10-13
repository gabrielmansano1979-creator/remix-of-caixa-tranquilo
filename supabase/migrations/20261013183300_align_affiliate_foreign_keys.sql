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
