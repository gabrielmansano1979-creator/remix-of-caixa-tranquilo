-- Harden the obsolete manual affiliate-rate override RPC.
-- The accountant tier is derived from confirmed referrals; manual overrides are not
-- part of the current application flow and must not be callable by signed-in clients.
REVOKE ALL ON FUNCTION public.admin_update_partner_rate(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_partner_rate(uuid, integer) TO service_role;
