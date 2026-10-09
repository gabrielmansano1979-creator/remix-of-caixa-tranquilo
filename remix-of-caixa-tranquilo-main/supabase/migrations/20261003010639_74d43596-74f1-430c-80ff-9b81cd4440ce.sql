CREATE TABLE public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id text NOT NULL UNIQUE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX whatsapp_events_pending_idx ON public.whatsapp_webhook_events(received_at) WHERE processed_at IS NULL;

ALTER TABLE public.reminder_logs ADD COLUMN IF NOT EXISTS delivery_status text, ADD COLUMN IF NOT EXISTS delivery_status_at timestamptz;
CREATE INDEX IF NOT EXISTS reminder_logs_provider_idx ON public.reminder_logs(provider_id);