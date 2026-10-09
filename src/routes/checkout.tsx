import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/checkout")({
  validateSearch: z.object({ ref: z.string().trim().max(80).optional() }),
  beforeLoad: async ({ search }) => {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) throw redirect({ to: "/planos", search: { ref: search.ref } });
    throw redirect({ to: "/cadastro", search: { ref: search.ref } });
  },
});
