-- Reconcile the deployed affiliate/accountant schema with the application contract.
-- Additive changes preserve existing financial records.
-- Validation RPC definitions live in the preceding security migration to avoid overwriting them here.
ALTER TABLE public.partner_requests
  ADD COLUMN IF NOT EXISTS tax_id text,
  ADD COLUMN IF NOT EXISTS crc_number text,
  ADD COLUMN IF NOT EXISTS pix_type text,
  ADD COLUMN IF NOT EXISTS pix_key text;

ALTER TABLE public.partner_requests ALTER COLUMN status SET DEFAULT 'pending_approval';

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS amount_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS client_email text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_url text;

ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_amount_cents_check;
ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_amount_cents_check CHECK (amount_cents >= 0);

-- Application and webhook use partner_requests.id as the affiliate identifier.
ALTER TABLE public.coupons DROP CONSTRAINT IF EXISTS coupons_partner_id_fkey;
ALTER TABLE public.coupons ADD CONSTRAINT coupons_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES public.partner_requests(id) ON DELETE CASCADE;

ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_partner_id_fkey;
ALTER TABLE public.commissions ADD CONSTRAINT commissions_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES public.partner_requests(id) ON DELETE CASCADE;

ALTER TABLE public.accountant_access DROP CONSTRAINT IF EXISTS accountant_access_partner_id_fkey;
ALTER TABLE public.accountant_access ADD CONSTRAINT accountant_access_partner_id_fkey
  FOREIGN KEY (partner_id) REFERENCES public.partner_requests(id) ON DELETE CASCADE;

ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_affiliate_partner_id_fkey;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_affiliate_partner_id_fkey
  FOREIGN KEY (affiliate_partner_id) REFERENCES public.partner_requests(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS coupons_partner_id_unique ON public.coupons(partner_id);
CREATE UNIQUE INDEX IF NOT EXISTS commissions_payment_id_unique
  ON public.commissions(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscriptions_affiliate_partner_idx
  ON public.subscriptions(affiliate_partner_id);
CREATE INDEX IF NOT EXISTS accountant_access_partner_idx
  ON public.accountant_access(partner_id, client_user_id);
