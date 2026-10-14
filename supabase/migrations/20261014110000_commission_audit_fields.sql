-- Keep an auditable snapshot of the actual discounted payment and the commission tier
-- used for each newly recorded commission. Historical records remain NULL when the
-- original payment base cannot be reliably reconstructed.
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS payment_amount_cents bigint,
  ADD COLUMN IF NOT EXISTS commission_percent integer;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.commissions'::regclass
      AND conname = 'commissions_payment_amount_cents_check'
  ) THEN
    ALTER TABLE public.commissions
      ADD CONSTRAINT commissions_payment_amount_cents_check
      CHECK (payment_amount_cents IS NULL OR payment_amount_cents > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.commissions'::regclass
      AND conname = 'commissions_commission_percent_check'
  ) THEN
    ALTER TABLE public.commissions
      ADD CONSTRAINT commissions_commission_percent_check
      CHECK (commission_percent IS NULL OR commission_percent IN (20, 25, 30));
  END IF;
END
$migration$;

CREATE OR REPLACE FUNCTION public.partner_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
DECLARE
  uid uuid := auth.uid();
  partner_record_id uuid;
  result jsonb;
BEGIN
  IF uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.partner_requests
    WHERE user_id = uid AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'approved partner access required';
  END IF;

  SELECT id INTO partner_record_id
  FROM public.partner_requests
  WHERE user_id = uid AND status = 'approved';

  IF partner_record_id IS NULL THEN RAISE EXCEPTION 'approved partner record not found'; END IF;

  SELECT jsonb_build_object(
    'coupon', (
      SELECT jsonb_build_object(
        'code', c.code,
        'discount_percent', c.discount_percent,
        'commission_percent', c.commission_percent
      )
      FROM public.coupons c
      WHERE c.partner_id = partner_record_id AND c.is_active
      LIMIT 1
    ),
    'totals', jsonb_build_object(
      'commission_cents', COALESCE((SELECT sum(c.amount_cents) FROM public.commissions c WHERE c.partner_id = partner_record_id), 0),
      'pending_cents', COALESCE((SELECT sum(c.amount_cents) FROM public.commissions c WHERE c.partner_id = partner_record_id AND c.status IN ('pending','available')), 0),
      'paid_cents', COALESCE((SELECT sum(c.amount_cents) FROM public.commissions c WHERE c.partner_id = partner_record_id AND c.status = 'paid'), 0),
      'referred_clients', (
        SELECT count(DISTINCT s.user_id) FROM public.subscriptions s
        WHERE s.affiliate_partner_id = partner_record_id AND s.paid_at IS NOT NULL
      ),
      'active_clients', (
        SELECT count(*) FROM public.subscriptions s
        WHERE s.affiliate_partner_id = partner_record_id AND s.status = 'active' AND s.paid_at IS NOT NULL
      )
    ),
    'referrals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', s.user_id,
        'client_name', COALESCE(NULLIF(trim(p.full_name), ''), NULLIF(trim(p.business_name), ''), 'Cliente'),
        'plan', COALESCE(s.plan::text, ''),
        'status', s.status,
        'created_at', s.created_at,
        'paid_at', s.paid_at
      ) ORDER BY s.paid_at DESC)
      FROM public.subscriptions s
      JOIN public.profiles p ON p.user_id = s.user_id
      WHERE s.affiliate_partner_id = partner_record_id
        AND s.paid_at IS NOT NULL
    ), '[]'::jsonb),
    'commissions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'client_name', c.client_name, 'amount_cents', c.amount_cents,
        'payment_amount_cents', c.payment_amount_cents, 'commission_percent', c.commission_percent,
        'status', c.status, 'created_at', c.created_at, 'paid_at', c.paid_at,
        'receipt_url', c.receipt_url
      ) ORDER BY c.created_at DESC)
      FROM public.commissions c
      WHERE c.partner_id = partner_record_id
    ), '[]'::jsonb),
    'clients', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'client_name', p.business_name,
        'plan', s.plan::text,
        'status', s.status,
        'entry_count', COALESCE(x.entry_count, 0),
        'income_cents', COALESCE(x.income_cents, 0),
        'expense_cents', COALESCE(x.expense_cents, 0),
        'shared_at', aa.granted_at,
        'entries', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'description', e.description, 'type', e.type, 'amount_cents', e.amount_cents,
            'due_date', e.due_date, 'status', e.status, 'paid_at', e.paid_at
          ) ORDER BY e.due_date)
          FROM public.entries e WHERE e.user_id = aa.client_user_id
        ), '[]'::jsonb)
      ) ORDER BY p.business_name)
      FROM public.accountant_access aa
      JOIN public.subscriptions s ON s.user_id = aa.client_user_id AND s.affiliate_partner_id = partner_record_id
      JOIN public.profiles p ON p.user_id = aa.client_user_id
      LEFT JOIN LATERAL (
        SELECT count(*) AS entry_count,
          COALESCE(sum(amount_cents) FILTER (WHERE type = 'income'), 0) AS income_cents,
          COALESCE(sum(amount_cents) FILTER (WHERE type = 'expense'), 0) AS expense_cents
        FROM public.entries e WHERE e.user_id = aa.client_user_id
      ) x ON true
      WHERE aa.partner_id = partner_record_id
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END
$function$;
