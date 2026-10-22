-- Premium client plan limits. Keep the existing schema and RPC contract intact.
-- 2147483647 is the PostgreSQL INTEGER ceiling and is used as the practical unlimited sentinel.
CREATE OR REPLACE FUNCTION public.plan_limits(_plan public.plan_tier)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _plan
    WHEN 'starter' THEN
      '{"pending_entries":2147483647,"emails_per_month":2147483647,"csv_rows":2147483647,"top_risks":2147483647,"edit_rule_days":true,"edit_rule_texts":true,"unlimited_entries":true,"receipt_attachments":true,"audit_traffic_light":true}'::jsonb
    WHEN 'pro' THEN
      '{"pending_entries":2147483647,"emails_per_month":2147483647,"csv_rows":2147483647,"top_risks":2147483647,"edit_rule_days":true,"edit_rule_texts":true,"unlimited_entries":true,"receipt_attachments":true,"audit_traffic_light":true,"cash_projection_days":30,"import_formats":["ofx","csv","pdf"],"pending_center":true}'::jsonb
    WHEN 'business' THEN
      '{"pending_entries":2147483647,"emails_per_month":2147483647,"csv_rows":2147483647,"top_risks":2147483647,"edit_rule_days":true,"edit_rule_texts":true,"unlimited_entries":true,"receipt_attachments":true,"audit_traffic_light":true,"cash_projection_days":30,"import_formats":["ofx","csv","pdf"],"pending_center":true,"receipt_ocr":true,"multiple_users":true,"priority_support":true}'::jsonb
  END
$$;

COMMENT ON FUNCTION public.plan_limits(public.plan_tier) IS
  'Returns the server-side entitlements and technical limits for Critical Cash customer plans. Client configuration is mirrored in src/config/plans.ts.';
