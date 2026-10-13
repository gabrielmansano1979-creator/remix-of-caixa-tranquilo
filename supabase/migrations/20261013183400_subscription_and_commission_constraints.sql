-- Restore the uniqueness assumptions used by subscription upserts and reporting.
-- Duplicate subscription user IDs were checked before adding this index.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_unique
  ON public.subscriptions(user_id);

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS subscription_id uuid;

-- The subscription table is one row per user; the unique index above makes this FK valid.
ALTER TABLE public.commissions
  DROP CONSTRAINT IF EXISTS commissions_subscription_id_fkey;
ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_subscription_id_fkey
  FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(user_id) ON DELETE SET NULL;

-- commissions_payment_id already has a unique constraint; remove the redundant index
-- created by the earlier schema reconciliation.
DROP INDEX IF EXISTS public.commissions_payment_id_unique;
