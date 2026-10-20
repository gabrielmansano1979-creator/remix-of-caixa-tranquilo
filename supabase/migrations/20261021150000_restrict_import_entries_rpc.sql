-- The import RPC validates auth.uid(), but anonymous callers should not have EXECUTE at all.
REVOKE ALL ON FUNCTION public.import_entries(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_entries(jsonb) TO authenticated;
