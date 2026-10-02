import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPlan } from "@/config/plans";

type Out = { url?: string; error?: string; qrCode?: string; copyPaste?: string; paymentId?: string };
const origin = () => {
  const env = process.env.APP_URL;
  if (env) return env.replace(/\/$/, "");
  return new URL(getRequest().url).origin;
};

async function ensureCustomer(userId: string, email: string | undefined, fullName?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const asaas = await import("./asaas.server");

  const { data: sub } = await supabaseAdmin.from("subscriptions").select("asaas_customer_id").eq("user_id", userId).maybeSingle();
  if (sub?.asaas_customer_id) return sub.asaas_customer_id;

  let customer = email ? await asaas.getCustomerByEmail(email) : null;
  if (!customer) {
    customer = await asaas.createCustomer(email || `${userId}@criefy.local`, fullName || userId);
  }

  await supabaseAdmin.from("subscriptions").upsert({
    user_id: userId,
    asaas_customer_id: customer.id,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });

  return customer.id;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ plan: z.enum(["starter", "pro", "business"]), interval: z.enum(["month", "year"]) }).parse(d))
  .handler(async ({ data, context }): Promise<Out> => {
    try {
      const { supabase, userId, claims } = context;
      const asaas = await import("./asaas.server");

      // Bloqueia downgrade se o uso atual exceder o plano escolhido.
      const { data: usage } = await supabase.rpc("my_usage");
      const pending = (usage as { pending_entries: number } | null)?.pending_entries ?? 0;
      if (pending > getPlan(data.plan).limits.pendingEntries) {
        return { error: `Você tem ${pending} contas pendentes; o plano ${getPlan(data.plan).name} permite ${getPlan(data.plan).limits.pendingEntries}.` };
      }

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const customerEmail = (claims as { email?: string }).email || `${userId}@criefy.local`;
      const customerName = (claims as { user_metadata?: { full_name?: string } }).user_metadata?.full_name;

      const customerId = await ensureCustomer(userId, customerEmail, customerName);

      const priceCents = data.plan === "starter"
        ? (data.interval === "year" ? 9700 : 970)
        : data.plan === "pro"
          ? (data.interval === "year" ? 19700 : 1970)
          : (data.interval === "year" ? 49700 : 4970);

      const externalRef = `sub_${userId}_${Date.now()}`;
      const charge = await asaas.createPixCharge(customerId, priceCents, externalRef);

      await supabaseAdmin.from("subscriptions").upsert({
        user_id: userId,
        asaas_payment_id: charge.id,
        asaas_customer_id: customerId,
        status: "pending_pix",
        plan: data.plan,
        billing_interval: data.interval,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });

      return {
        qrCode: charge.pixQrCode,
        copyPaste: charge.pixCopyAndPaste,
        paymentId: charge.id
      };
    } catch (e) {
      const msg = String(e);
      return { error: msg.includes("NOT_CONFIGURED")
        ? "Pagamentos ainda não configurados. Configure ASAAS_API_KEY no cofre."
        : "Não foi possível iniciar o pagamento."
      };
    }
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Out> => {
    return { error: "Portal gerenciado via histórico de pagamentos no painel." };
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reason: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin.from("subscriptions")
      .select("asaas_payment_id, status")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (!sub) return { ok: false, message: "Nenhuma assinatura ativa." };

    try {
      await supabaseAdmin.from("subscriptions").update({
        cancel_at_period_end: true,
        updated_at: new Date().toISOString()
      }).eq("user_id", context.userId);

      await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        action: "subscription_cancel",
        meta: { reason: data.reason ?? null }
      });

      return { ok: true, message: "Assinatura cancelada. Você mantém o acesso até o fim do período." };
    } catch {
      return { ok: false, message: "Não foi possível cancelar agora." };
    }
  });