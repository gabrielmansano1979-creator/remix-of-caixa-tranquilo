import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPlan, FIRST_PIX_DISCOUNT } from "@/config/plans";

type Out = { url?: string; error?: string; qrCode?: string; copyPaste?: string; paymentId?: string };
const origin = async () => {
  const env = process.env["APP_URL"];
  if (env) return env.replace(/\/$/, "");
  const { getRequest } = await import("@tanstack/react-start/server");
  return new URL(getRequest().url).origin;
};

async function ensureCustomer(userId: string, email: string | undefined, fullName: string | undefined, doc: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const asaas = await import("./asaas.server");

  const { data: sub } = await supabaseAdmin.from("subscriptions").select("asaas_customer_id").eq("user_id", userId).maybeSingle();
  if (sub?.asaas_customer_id) {
    await asaas.updateCustomerDoc(sub.asaas_customer_id, doc);
    return sub.asaas_customer_id;
  }

  let customer: { id: string } | null = email ? await asaas.getCustomerByEmail(email) : null;
  if (customer) await asaas.updateCustomerDoc(customer.id, doc);
  else customer = await asaas.createCustomer(email || `${userId}@criticalcash.app`, fullName || (email ?? "Cliente").split("@")[0], doc);

  await supabaseAdmin.from("subscriptions").upsert({
    user_id: userId,
    asaas_customer_id: customer!.id,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });

  return customer!.id;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    plan: z.enum(["starter", "pro", "business"]),
    interval: z.enum(["month", "year"]),
    cpfCnpj: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => v.length === 11 || v.length === 14, "CPF ou CNPJ inválido"),
    referralCode: z.string().trim().max(80).optional(),
  }).parse(d))
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
      const metadata = (claims as { user_metadata?: { full_name?: string; affiliate_referral_code?: string } }).user_metadata;
      const customerName = metadata?.full_name;
      const referralCode = (data.referralCode || metadata?.affiliate_referral_code || "").trim().toUpperCase();

      const plan = getPlan(data.plan);
      const basePrice = data.interval === "year" ? plan.priceYearCents : plan.priceMonthCents;
      const { data: prev, error: prevError } = await supabaseAdmin.from("subscriptions").select("paid_at").eq("user_id", userId).maybeSingle();
      if (prevError) throw prevError;
      const isFirst = !prev?.paid_at;
      let affiliate: { partnerId: string; code: string; commissionPercent: number; discountPercent: number } | null = null;

      if (referralCode) {
        const { data: coupon, error: couponError } = await supabaseAdmin
          .from("coupons")
          .select("code, partner_id, discount_percent, commission_percent")
          .eq("code", referralCode)
          .eq("is_active", true)
          .maybeSingle();
        if (couponError) throw couponError;
        if (!coupon) return { error: "O cupom de indicação é inválido ou está inativo." };

        const { data: partner, error: partnerError } = await supabaseAdmin
          .from("partner_requests")
          .select("user_id, email, tax_id, status")
          .eq("user_id", coupon.partner_id)
          .maybeSingle();
        if (partnerError) throw partnerError;
        if (!partner || partner.status !== "approved") return { error: "O cupom de indicação não está disponível." };

        const buyerEmail = customerEmail.trim().toLowerCase();
        const partnerEmail = (partner.email ?? "").trim().toLowerCase();
        const buyerDoc = data.cpfCnpj.replace(/\D/g, "");
        const partnerDoc = partner.tax_id.replace(/\D/g, "");
        if (partner.user_id === userId || (partnerEmail && partnerEmail === buyerEmail) || (partnerDoc && partnerDoc === buyerDoc)) {
          return { error: "Você não pode utilizar seu próprio cupom de indicação para assinar um plano." };
        }
        affiliate = {
          partnerId: partner.user_id,
          code: coupon.code,
          commissionPercent: coupon.commission_percent,
          discountPercent: coupon.discount_percent,
        };
      }

      const discountPercent = affiliate?.discountPercent ?? (isFirst ? Math.round(FIRST_PIX_DISCOUNT * 100) : 0);
      const priceCents = Math.round(basePrice * (1 - discountPercent / 100));
      const customerId = await ensureCustomer(userId, customerEmail, customerName, data.cpfCnpj);

      const externalRef = `sub_${userId}_${Date.now()}`;
      const discountLabel = affiliate ? ` (cupom ${affiliate.code}: ${discountPercent}% off)` : discountPercent ? ` (${discountPercent}% off 1ª assinatura)` : "";
      const charge = await asaas.createPixCharge(customerId, priceCents, externalRef, `Critical Cash ${plan.name} ${data.interval === "year" ? "anual" : "mensal"}${discountLabel}`);

      const { error: subscriptionError } = await supabaseAdmin.from("subscriptions").upsert({
        user_id: userId,
        asaas_payment_id: charge.id,
        asaas_customer_id: customerId,
        status: "pending_pix",
        plan: data.plan,
        billing_interval: data.interval,
        affiliate_partner_id: affiliate?.partnerId ?? null,
        affiliate_coupon_code: affiliate?.code ?? null,
        affiliate_commission_percent: affiliate?.commissionPercent ?? null,
        affiliate_discount_percent: affiliate ? discountPercent : null,
        affiliate_payment_amount_cents: affiliate ? priceCents : null,
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });
      if (subscriptionError) throw subscriptionError;

      return {
        qrCode: charge.pixQrCode,
        copyPaste: charge.pixCopyAndPaste,
        paymentId: charge.id
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("checkout error", msg);
      if (msg.includes("NOT_CONFIGURED")) return { error: "Pagamentos ainda não configurados." };
      if (msg.startsWith("ASAAS_401")) return { error: "A chave do Asaas é inválida ou de outro ambiente. Gere uma nova chave no Asaas." };
      const desc = msg.split(":").slice(1).join(":").trim();
      return { error: desc ? `Asaas: ${desc}` : "Não foi possível gerar o Pix. Tente novamente." };
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