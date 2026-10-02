import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPlan } from "@/config/plans";

type Out = { url?: string; error?: string };
const origin = () => {
  const env = process.env.APP_URL;
  if (env) return env.replace(/\/$/, "");
  return new URL(getRequest().url).origin;
};

async function ensureCustomer(userId: string, email: string | undefined) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { stripe } = await import("./stripe.server");
  const { data: sub } = await supabaseAdmin.from("subscriptions").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (sub?.stripe_customer_id) return sub.stripe_customer_id;
  const c = await stripe<{ id: string }>("POST", "customers", { email, metadata: { user_id: userId } });
  await supabaseAdmin.from("subscriptions").upsert({ user_id: userId, stripe_customer_id: c.id, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return c.id;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ plan: z.enum(["starter", "pro", "business"]), interval: z.enum(["month", "year"]) }).parse(d))
  .handler(async ({ data, context }): Promise<Out> => {
    try {
      const { supabase, userId, claims } = context;
      const { stripe, priceId } = await import("./stripe.server");
      // Bloqueia downgrade se o uso atual exceder o plano escolhido.
      const { data: usage } = await supabase.rpc("my_usage");
      const pending = (usage as { pending_entries: number } | null)?.pending_entries ?? 0;
      if (pending > getPlan(data.plan).limits.pendingEntries) return { error: `Você tem ${pending} contas pendentes; o plano ${getPlan(data.plan).name} permite ${getPlan(data.plan).limits.pendingEntries}.` };
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: sub } = await supabaseAdmin.from("subscriptions").select("stripe_subscription_id, status").eq("user_id", userId).maybeSingle();
      const customer = await ensureCustomer(userId, (claims as { email?: string }).email);
      if (sub?.stripe_subscription_id && ["active", "past_due"].includes(sub.status)) {
        // Já assina: troca de plano via Portal (proração gerenciada pelo Stripe).
        const p = await stripe<{ url: string }>("POST", "billing_portal/sessions", {
          customer, return_url: `${origin()}/assinatura`,
          flow_data: { type: "subscription_update", subscription_update: { subscription: sub.stripe_subscription_id } },
        });
        return { url: p.url };
      }
      const s = await stripe<{ url: string }>("POST", "checkout/sessions", {
        mode: "subscription", customer, client_reference_id: userId,
        line_items: [{ price: priceId(data.plan, data.interval), quantity: 1 }],
        payment_method_types: (process.env.STRIPE_PAYMENT_METHODS ?? "card").split(","),
        allow_promotion_codes: true, locale: "pt-BR",
        subscription_data: { metadata: { user_id: userId } },
        success_url: `${origin()}/assinatura?sucesso=1`, cancel_url: `${origin()}/planos`,
      });
      return { url: s.url };
    } catch (e) {
      return { error: String(e).includes("NOT_CONFIGURED") ? "Pagamentos ainda não configurados." : "Não foi possível iniciar o pagamento." };
    }
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Out> => {
    try {
      const { stripe } = await import("./stripe.server");
      const customer = await ensureCustomer(context.userId, (context.claims as { email?: string }).email);
      const p = await stripe<{ url: string }>("POST", "billing_portal/sessions", { customer, return_url: `${origin()}/assinatura` });
      return { url: p.url };
    } catch (e) {
      return { error: String(e).includes("NOT_CONFIGURED") ? "Pagamentos ainda não configurados." : "Não foi possível abrir o portal." };
    }
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reason: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin.from("subscriptions").select("stripe_subscription_id").eq("user_id", context.userId).maybeSingle();
    if (!sub?.stripe_subscription_id) return { ok: false, message: "Nenhuma assinatura ativa." };
    try {
      const { stripe } = await import("./stripe.server");
      await stripe("POST", `subscriptions/${sub.stripe_subscription_id}`, { cancel_at_period_end: true, cancellation_details: { comment: data.reason ?? "" } });
      await supabaseAdmin.from("subscriptions").update({ cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq("user_id", context.userId);
      await supabaseAdmin.from("audit_logs").insert({ user_id: context.userId, action: "subscription_cancel", meta: { reason: data.reason ?? null } });
      return { ok: true, message: "Assinatura cancelada. Você mantém o acesso até o fim do período." };
    } catch {
      return { ok: false, message: "Não foi possível cancelar agora. Tente pelo portal." };
    }
  });
