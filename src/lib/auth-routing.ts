import { supabase } from "@/integrations/supabase/client";

// A role é verificada pelo banco para o próprio usuário autenticado.
// Qualquer falha de autorização resulta em acesso não administrativo.
export async function getAuthenticatedDestination(userId: string): Promise<string> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user || user.id !== userId) return "/login";

    const { data: isAdmin, error } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (error) {
      console.error("Erro ao verificar função administrativa:", error);
      return "/caixa";
    }

    return isAdmin === true ? "/admin" : user.user_metadata?.account_type === "accountant" ? "/contador" : "/caixa";
  } catch (error) {
    console.error("Erro em getAuthenticatedDestination:", error);
    return "/caixa";
  }
}
