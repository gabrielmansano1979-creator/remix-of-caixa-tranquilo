CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  partner_id uuid NOT NULL REFERENCES public.partner_requests(id) ON DELETE CASCADE,
  discount_percent integer NOT NULL DEFAULT 10 CHECK (discount_percent = 10),
  commission_percent integer NOT NULL DEFAULT 20 CHECK (commission_percent BETWEEN 20 AND 30),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id)
);

CREATE TABLE IF NOT EXISTS public.commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_requests(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  client_name text,
  amount_cents bigint NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'paid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  receipt_url text
);

CREATE TABLE IF NOT EXISTS public.accountant_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  accountant_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accountant_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupons_read" ON public.coupons;
DROP POLICY IF EXISTS "commissions_admin_read" ON public.commissions;
DROP POLICY IF EXISTS "accountant_invites_manage" ON public.accountant_invites;
