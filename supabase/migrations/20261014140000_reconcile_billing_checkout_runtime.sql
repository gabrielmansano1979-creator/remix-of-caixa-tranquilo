-- Reconcile the Lovable Cloud database with the current Critical Cash Asaas checkout/webhook code.
-- This migration is intentionally additive and idempotent. It preserves existing financial rows.
BEGIN;

-- Current billing code needs an internal subscription UUID separate from user_id.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS id uuid,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text;
UPDATE public.subscriptions SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE public.subscriptions
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_id_unique ON public.subscriptions(id);
CREATE INDEX IF NOT EXISTS subscriptions_asaas_subscription_idx
  ON public.subscriptions(asaas_subscription_id);

-- Current app/webhook reads the email column from profiles.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

-- Affiliate code addresses partners by partner_requests.id. Legacy rows are mapped to user_id
-- so existing coupon/commission references remain stable during this schema reconciliation.
ALTER TABLE public.partner_requests
  ADD COLUMN IF NOT EXISTS id uuid,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
UPDATE public.partner_requests SET id = user_id WHERE id IS NULL;
ALTER TABLE public.partner_requests
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS partner_requests_id_unique ON public.partner_requests(id);

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Fields written/read by the current affiliate commission webhook.
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS payment_amount_cents bigint,
  ADD COLUMN IF NOT EXISTS commission_percent integer;
UPDATE public.commissions
SET amount = amount_cents::numeric / 100
WHERE amount = 0 AND amount_cents > 0;

ALTER TABLE public.commissions
  DROP CONSTRAINT IF EXISTS commissions_payment_amount_cents_check,
  DROP CONSTRAINT IF EXISTS commissions_commission_percent_check;
ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_payment_amount_cents_check
    CHECK (payment_amount_cents IS NULL OR payment_amount_cents > 0),
  ADD CONSTRAINT commissions_commission_percent_check
    CHECK (commission_percent IS NULL OR commission_percent IN (20, 25, 30));

CREATE UNIQUE INDEX IF NOT EXISTS commissions_payment_id_unique
  ON public.commissions(payment_id);

-- Align affiliate foreign keys with the current code's partner_requests.id references.
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

-- Prevent a single user from having multiple concurrent pending checkout records.
CREATE TABLE IF NOT EXISTS public.pending_billing_changes (
  checkout_reference text PRIMARY KEY,
  payment_id text UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id text NOT NULL,
  plan text NOT NULL CHECK (plan IN ('starter', 'pro', 'business')),
  billing_interval text NOT NULL CHECK (billing_interval IN ('month', 'year')),
  initial_amount_cents bigint NOT NULL CHECK (initial_amount_cents > 0),
  recurring_amount_cents bigint NOT NULL CHECK (recurring_amount_cents > 0),
  affiliate_partner_id uuid,
  affiliate_coupon_code text,
  affiliate_commission_percent integer CHECK (affiliate_commission_percent IS NULL OR affiliate_commission_percent IN (20, 25, 30)),
  affiliate_discount_percent integer CHECK (affiliate_discount_percent IS NULL OR affiliate_discount_percent BETWEEN 0 AND 100),
  previous_asaas_subscription_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed', 'failed')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pending_billing_changes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.pending_billing_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.pending_billing_changes TO service_role;
CREATE UNIQUE INDEX IF NOT EXISTS pending_billing_changes_one_pending_per_user
  ON public.pending_billing_changes(user_id) WHERE status = 'pending';

-- Payment-level idempotency: the Asaas webhook can deliver multiple events for one payment.
CREATE TABLE IF NOT EXISTS public.asaas_processed_payments (
  payment_id text PRIMARY KEY,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed')),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asaas_processed_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.asaas_processed_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.asaas_processed_payments TO service_role;

-- Ensure the Asaas event inbox exists and remains server-only.
CREATE TABLE IF NOT EXISTS public.asaas_events (
  id text PRIMARY KEY,
  type text,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.asaas_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.asaas_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.asaas_events TO service_role;

-- The current webhook reads/writes details; copy prior meta payloads only when details is empty.
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE public.audit_logs
SET details = meta
WHERE details = '{}'::jsonb AND meta IS NOT NULL AND meta <> '{}'::jsonb;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.audit_logs TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
