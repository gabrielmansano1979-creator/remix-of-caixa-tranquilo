import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Exclui a conta (LGPD): cancela no Stripe, apaga dados e o usuário. */
export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ confirm: z.literal("EXCLUIR") }).parse(d))
  .handler(async ({ context }): Promise<{ ok: boolean; message: string }> => {
    const uid = context.userId;
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await db.from("subscriptions").select("stripe_subscription_id").eq("user_id", uid).maybeSingle();
    if (sub?.stripe_subscription_id) {
      try {
        const { stripe } = await import("./stripe.server");
        await stripe("DELETE", `subscriptions/${sub.stripe_subscription_id}`);
      } catch (e) {
        console.error("stripe cancel on delete failed", e);
        return { ok: false, message: "Não conseguimos cancelar sua assinatura. Tente novamente ou fale com o suporte." };
      }
    }
    for (const t of ["reminder_logs", "entries", "reminder_rules", "unsubscribed_emails", "subscriptions", "audit_logs", "profiles"] as const) {
      await db.from(t).delete().eq("user_id", uid);
    }
    const { error } = await db.auth.admin.deleteUser(uid);
    if (error) return { ok: false, message: "Dados apagados, mas houve erro ao remover o login. Contate o suporte." };
    return { ok: true, message: "Conta excluída." };
  });
