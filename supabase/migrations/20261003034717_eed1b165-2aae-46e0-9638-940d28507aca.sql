ALTER TYPE public.sub_status ADD VALUE IF NOT EXISTS 'pending_pix';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS asaas_customer_id text, ADD COLUMN IF NOT EXISTS asaas_payment_id text, ADD COLUMN IF NOT EXISTS paid_at timestamptz;
CREATE INDEX IF NOT EXISTS subscriptions_asaas_payment_idx ON public.subscriptions(asaas_payment_id);
CREATE TABLE IF NOT EXISTS public.asaas_events (id text PRIMARY KEY, type text, processed_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.asaas_events TO service_role;
ALTER TABLE public.asaas_events ENABLE ROW LEVEL SECURITY;