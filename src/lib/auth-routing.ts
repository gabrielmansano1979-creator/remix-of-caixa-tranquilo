import { supabase } from "@/integrations/supabase/client";

// Retornamos string simples para o TypeScript não travar na verificação de rotas estáticas
export async function getAuthenticatedDestination(userId: string): Promise<string> {
  try {
    // 1. Verificação na tabela user_roles
    const { data: adminRole, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleError && adminRole?.role === "admin") {
      return "/admin";
    }

    // 2. Verificação via RPC
    const { data: isAdmin, error: accessError } = await supabase.rpc("has_role", {
      _role: "admin",
      _user_id: userId,
    });

    if (!accessError && isAdmin) {
      return "/admin";
    }

    // 3. Destino padrão caso não seja admin
    return "/contador";
  } catch (err) {
    console.error("Erro em getAuthenticatedDestination:", err);
    return "/admin";
  }
}