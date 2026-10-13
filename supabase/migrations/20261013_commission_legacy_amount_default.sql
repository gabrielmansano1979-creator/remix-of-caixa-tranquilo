-- The deployed table retains a legacy required amount column while application code
-- uses amount_cents. Default the legacy field so new commission inserts remain compatible.
ALTER TABLE public.commissions
  ALTER COLUMN amount SET DEFAULT 0;
