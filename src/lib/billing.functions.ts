import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getPlan, FIRST_PIX_DISCOUNT } from "@/config/plans";
import { isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/identity";

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
    await asaas.updateCustomerDoc(sub.asaas_customer_id, doc, fullName);
    return sub.asaas_customer_id;
  }

  let customer: { id: string } | null = email ? await asaas.getCustomerByEmail(email) : null;
  if (customer) await asaas.updateCustomerDoc(customer.id, doc, fullName);
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
    legalName: z.string().trim().min(2, "Informe seu nome civil completo").max(160),
    cpfCnpj: z.string().transform(normalizeCpfCnpj).refine(isValidCpfCnpj, "CPF ou CNPJ inválido"),
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
      const customerName = data.legalName;
      const { data: existingCheckout, error: existingCheckoutError } = await supabaseAdmin
        .from("pending_billing_changes")
        .select("checkout_reference, payment_id, plan, billing_interval, status, updated_at")
        .eq("user_id", userId)
        .eq("status", "pending")
        .maybeSingle();
      if (existingCheckoutError) throw existingCheckoutError;
      if (existingCheckout) {
        let existingPaymentId = existingCheckout.payment_id;
        if (!existingPaymentId) {
          // If the process lost the Asaas response after creating a charge, recover
          // it using the same externalReference before deciding to create anything new.
          const recoveredPayment = await asaas.findPaymentByExternalReference(existingCheckout.checkout_reference);
          if (recoveredPayment) {
            existingPaymentId = recoveredPayment.id;
            const { error: relinkError } = await supabaseAdmin.from("pending_billing_changes")
              .update({ payment_id: existingPaymentId, updated_at: new Date().toISOString() })
              .eq("checkout_reference", existingCheckout.checkout_reference)
              .eq("status", "pending");
            if (relinkError) throw relinkError;
          } else {
            const lastUpdate = Date.parse(existingCheckout.updated_at);
            const requestStillInFlight = Number.isFinite(lastUpdate) && Date.now() - lastUpdate < 5 * 60 * 1000;
            if (requestStillInFlight) {
              return { error: "Seu Pix está sendo preparado. Aguarde alguns segundos e tente novamente." };
            }
            // The checkout record is stale and Asaas has no matching charge, so allow recovery.
            const { error: staleCheckoutError } = await supabaseAdmin.from("pending_billing_changes")
              .update({ status: "failed", updated_at: new Date().toISOString() })
              .eq("checkout_reference", existingCheckout.checkout_reference)
              .eq("status", "pending");
            if (staleCheckoutError) throw staleCheckoutError;
          }
        }

        if (existingPaymentId) {
          const currentPayment = await asaas.getPayment(existingPaymentId);
          const paymentStatus = currentPayment.status.toUpperCase();
          if (["CONFIRMED", "RECEIVED", "PAID", "SETTLED"].includes(paymentStatus)) {
            return { error: "O Asaas já identificou o pagamento. A ativação está sendo processada; não gere outro Pix." };
          }

          const paymentAlreadyUnavailable = ["DELETED", "REFUNDED", "CANCELED", "CANCELLED", "EXPIRED"].includes(paymentStatus);
          const paymentIsOverdue = paymentStatus === "OVERDUE";
          const sameCheckout = existingCheckout.plan === data.plan && existingCheckout.billing_interval === data.interval;
          if (!paymentAlreadyUnavailable && !paymentIsOverdue && sameCheckout) {
            const qr = await asaas.getPixQrCode(existingPaymentId);
            return { qrCode: qr.pixQrCode, copyPaste: qr.pixCopyAndPaste, paymentId: existingPaymentId };
          }

          if (!paymentAlreadyUnavailable) {
            // Delete an unpaid old charge before replacing it so two Pix codes cannot both activate a plan.
            try {
              await asaas.deletePayment(existingPaymentId);
            } catch (error) {
              if (!(error instanceof Error) || !error.message.startsWith("ASAAS_404")) throw error;
            }
          }

          const { error: stalePaymentError } = await supabaseAdmin.from("pending_billing_changes")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("checkout_reference", existingCheckout.checkout_reference)
            .eq("status", "pending");
          if (stalePaymentError) throw stalePaymentError;
        }
      }

      const { data: prev, error: prevError } = await supabaseAdmin.from("subscriptions")
        .select("paid_at, affiliate_partner_id, affiliate_coupon_code, affiliate_commission_percent, affiliate_discount_percent, asaas_subscription_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (prevError) throw prevError;
      const requestedReferralCode = (data.referralCode || metadata?.affiliate_referral_code || "").trim().toUpperCase();
      if (prev?.paid_at && prev.affiliate_partner_id && requestedReferralCode && requestedReferralCode !== prev.affiliate_coupon_code) {
        return { error: "A indicação desta assinatura já está vinculada e não pode ser substituída." };
      }
      const referralCode = requestedReferralCode || prev?.affiliate_coupon_code || "";

      const plan = getPlan(data.plan);
      const basePrice = data.interval === "year" ? plan.priceYearCents : plan.priceMonthCents;
      const isFirst = !prev?.paid_at;
      let affiliate: { partnerId: string; code: string; commissionPercent: number; discountPercent: number } | null = null;

      if (referralCode) {
        if (prev?.affiliate_partner_id && prev.affiliate_coupon_code === referralCode && prev.affiliate_commission_percent && prev.affiliate_discount_percent) {
          const { data: currentCoupon, error: currentCouponError } = await supabaseAdmin
            .from("coupons")
            .select("commission_percent, discount_percent")
            .eq("code", referralCode)
            .eq("is_active", true)
            .maybeSingle();
          if (currentCouponError) throw currentCouponError;
          affiliate = {
            partnerId: prev.affiliate_partner_id,
            code: referralCode,
            // A referred customer's commission tier and discount are fixed at acquisition.
            // A later change in the accountant's tier must only affect newly acquired clients.
            commissionPercent: prev.affiliate_commission_percent ?? currentCoupon?.commission_percent ?? 20,
            discountPercent: prev.affiliate_discount_percent ?? currentCoupon?.discount_percent ?? 20,
          };
        } else {
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
            .select("id, user_id, email, tax_id, status")
            .eq("id", coupon.partner_id)
            .maybeSingle();
          if (partnerError) throw partnerError;
          if (!partner || partner.status !== "approved") return { error: "O cupom de indicação não está disponível." };

          const buyerEmail = customerEmail.trim().toLowerCase();
          const partnerEmail = (partner.email ?? "").trim().toLowerCase();
          const buyerDoc = normalizeCpfCnpj(data.cpfCnpj);
          const partnerDoc = normalizeCpfCnpj(partner.tax_id);
          if (partner.user_id === userId || (partnerEmail && partnerEmail === buyerEmail) || (partnerDoc && partnerDoc === buyerDoc)) {
            return { error: "Você não pode utilizar seu próprio cupom de indicação para assinar um plano." };
          }
          affiliate = {
            partnerId: coupon.partner_id,
            code: coupon.code,
            commissionPercent: coupon.commission_percent,
            discountPercent: coupon.discount_percent,
          };
        }
      }

      const discountPercent = affiliate?.discountPercent ?? (isFirst ? Math.round(FIRST_PIX_DISCOUNT * 100) : 0);
      const priceCents = Math.round(basePrice * (1 - discountPercent / 100));
      // Affiliate referrals get the discount on the acquisition payment and the first
      // monthly renewal. The webhook restores full price after the second paid invoice,
      // so the third monthly charge uses the plan's normal price. Annual renewals are full price.
      const recurringDiscountPercent = data.interval === "month" ? (affiliate?.discountPercent ?? 0) : 0;
      const recurringPriceCents = Math.round(basePrice * (1 - recurringDiscountPercent / 100));
      const customerId = await ensureCustomer(userId, customerEmail, customerName, data.cpfCnpj);

      const checkoutReference = `cc_${userId}_${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const { error: pendingInsertError } = await supabaseAdmin.from("pending_billing_changes").insert({
        checkout_reference: checkoutReference,
        payment_id: null,
        user_id: userId,
        customer_id: customerId,
        plan: data.plan,
        billing_interval: data.interval,
        initial_amount_cents: priceCents,
        recurring_amount_cents: recurringPriceCents,
        affiliate_partner_id: affiliate?.partnerId ?? null,
        affiliate_coupon_code: affiliate?.code ?? null,
        affiliate_commission_percent: affiliate?.commissionPercent ?? null,
        affiliate_discount_percent: affiliate?.discountPercent ?? null,
        previous_asaas_subscription_id: prev?.asaas_subscription_id ?? null,
        status: "pending",
        updated_at: now,
      });
      if (pendingInsertError) {
        if (pendingInsertError.code === "23505") {
          return { error: "Já existe um Pix pendente para esta conta. Reabra o checkout do plano que você escolheu ou aguarde a confirmação." };
        }
        throw pendingInsertError;
      }

      const discountLabel = affiliate
        ? ` (cupom ${affiliate.code}: ${discountPercent}% off)`
        : discountPercent ? ` (${discountPercent}% off 1º pagamento)` : "";
      let charge: Awaited<ReturnType<typeof asaas.createPixCharge>>;
      try {
        charge = await asaas.createPixCharge(
          customerId,
          priceCents,
          checkoutReference,
          `Critical Cash ${plan.name} ${data.interval === "year" ? "anual" : "mensal"}${discountLabel}`,
        );
      } catch (error) {
        // The request may have reached Asaas even when the network response was lost.
        // Keep the stable checkout reference pending so a retry can recover that payment
        // instead of creating a second PIX charge. Stale empty references are retired after
        // the recovery window by the next checkout attempt.
        console.error("Asaas PIX creation result is ambiguous; keeping checkout reference for recovery", checkoutReference, error);
        throw new Error("PIX_CREATE_STATUS_UNKNOWN:Não foi possível confirmar se o Pix foi criado. Reabra o checkout em alguns minutos; o sistema verificará a cobrança existente antes de gerar outra.");
      }

      const { error: paymentLinkError } = await supabaseAdmin.from("pending_billing_changes")
        .update({ payment_id: charge.id, updated_at: new Date().toISOString() })
        .eq("checkout_reference", checkoutReference)
        .eq("status", "pending");
      if (paymentLinkError) {
        try { await asaas.deletePayment(charge.id); } catch (cleanupError) {
          console.error("Asaas pending payment cleanup failed", charge.id, cleanupError);
        }
        await supabaseAdmin.from("pending_billing_changes")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("checkout_reference", checkoutReference);
        throw paymentLinkError;
      }

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
    const { data: sub, error: lookupError } = await supabaseAdmin.from("subscriptions")
      .select("asaas_subscription_id, status, current_period_end, cancel_at_period_end")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (lookupError) {
      console.error("subscription cancellation lookup failed", lookupError);
      return { ok: false, message: "Não foi possível verificar sua assinatura." };
    }
    if (!sub) return { ok: false, message: "Nenhuma assinatura encontrada." };
    if (sub.status === "canceled" && sub.cancel_at_period_end) {
      return { ok: true, message: "A recorrência já foi cancelada; seu acesso termina no fim do período pago." };
    }

    try {
      if (sub.asaas_subscription_id) {
        const asaas = await import("./asaas.server");
        await asaas.cancelAsaasSubscription(sub.asaas_subscription_id);
      }

      const now = new Date();
      const hasPaidTimeRemaining = Boolean(
        sub.current_period_end && Date.parse(sub.current_period_end) > now.getTime(),
      );
      const { error: updateError } = await supabaseAdmin.from("subscriptions").update({
        status: hasPaidTimeRemaining ? "canceled" : "expired",
        cancel_at_period_end: hasPaidTimeRemaining,
        updated_at: now.toISOString(),
      }).eq("user_id", context.userId);
      if (updateError) throw updateError;

      const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        action: "subscription_cancel",
        meta: { reason: data.reason ?? null, asaas_subscription_id: sub.asaas_subscription_id ?? null },
      });
      if (auditError) throw auditError;

      return hasPaidTimeRemaining
        ? { ok: true, message: "A recorrência foi cancelada. Você mantém o acesso até o fim do período pago." }
        : { ok: true, message: "A recorrência foi cancelada e não há período pago restante." };
    } catch (error) {
      console.error("subscription cancellation failed", error);
      return { ok: false, message: "Não foi possível cancelar a recorrência agora. Tente novamente." };
    }
  });