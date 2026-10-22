import { createFileRoute } from "@tanstack/react-router";
import { calculateCommissionAmountCents } from "@/lib/affiliate-commission";
import { getPlan, type PlanId } from "@/config/plans";
import { nextBillingDate, type BillingInterval } from "@/lib/billing-cycle";
import { normalizeCpfCnpj } from "@/lib/identity";

type AdminDb = typeof import("@/integrations/supabase/client.server")["supabaseAdmin"];

function amountToCents(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new RangeError("Asaas returned an invalid payment amount");
  }
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new RangeError("Asaas payment amount exceeds exact integer precision");
  }
  return cents;
}

function localMidnightTimestamp(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RangeError("billing date must use YYYY-MM-DD");
  }
  // Keep the current period valid through the full São Paulo billing date.
  // Keep the stored local date unchanged because the UI also displays it as the next due date.
  return new Date(date + "T23:59:59.999-03:00").toISOString();
}

async function recordAffiliateCommission(
  db: AdminDb,
  input: {
    partnerId: string | null;
    userId: string;
    subscriptionId: string;
    paymentId: string;
    actualPaidAmountCents: number;
    commissionPercentAtAcquisition?: number | null;
  },
) {
  if (!input.partnerId || input.actualPaidAmountCents <= 0) return;

  const { data: partner, error: partnerError } = await db.from("partner_requests")
    .select("id, user_id, tax_id, status, pix_type, pix_key")
    .eq("id", input.partnerId)
    .maybeSingle();
  if (partnerError) throw partnerError;
  if (partner?.status !== "approved" || !partner.pix_type || !partner.pix_key) return;
  // Self-referral checks use only CPF/CNPJ. The billing provider is the source
  // of the buyer document on confirmed payments; email and login ID are not identity keys.
  const { data: subscription, error: subscriptionError } = await db.from("subscriptions")
    .select("asaas_customer_id")
    .eq("id", input.subscriptionId)
    .maybeSingle();
  if (subscriptionError) throw subscriptionError;
  if (subscription?.asaas_customer_id && partner.tax_id) {
    const asaas = await import("@/lib/asaas.server");
    const buyerDocument = await asaas.getCustomerDocument(subscription.asaas_customer_id);
    const buyerDoc = normalizeCpfCnpj(buyerDocument ?? "");
    const partnerDoc = normalizeCpfCnpj(partner.tax_id ?? "");
    if (buyerDoc && partnerDoc && buyerDoc === partnerDoc) return;
  }

  let commissionRate = Number(input.commissionPercentAtAcquisition ?? 0);
  if (![20, 25, 30].includes(commissionRate)) {
    const { data: coupon, error: couponError } = await db.from("coupons")
      .select("commission_percent, is_active")
      .eq("partner_id", input.partnerId)
      .maybeSingle();
    if (couponError) throw couponError;
    commissionRate = Number(coupon?.commission_percent ?? 0);
    if (!coupon?.is_active || ![20, 25, 30].includes(commissionRate)) return;
  }

  const { data: profile, error: profileError } = await db.from("profiles")
    .select("full_name, business_name, email")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (profileError) throw profileError;
  const { data: authResult } = await db.auth.admin.getUserById(input.userId);
  const metadata = authResult.user?.user_metadata ?? {};
  const metadataName = typeof metadata.full_name === "string"
    ? metadata.full_name
    : typeof metadata.name === "string" ? metadata.name : "";
  const clientName =
    (profile?.full_name ?? "").trim() ||
    (profile?.business_name ?? "").trim() ||
    metadataName.trim() ||
    profile?.email ||
    authResult.user?.email ||
    "Cliente";

  const amountCents = calculateCommissionAmountCents(
    input.actualPaidAmountCents,
    commissionRate as 20 | 25 | 30,
  );
  const { error: commissionError } = await db.from("commissions").upsert({
    partner_id: input.partnerId,
    subscription_id: input.subscriptionId,
    payment_id: input.paymentId,
    client_name: clientName,
    client_email: profile?.email ?? authResult.user?.email ?? null,
    amount: amountCents / 100,
    amount_cents: amountCents,
    payment_amount_cents: input.actualPaidAmountCents,
    commission_percent: commissionRate,
    status: "pending",
  }, { onConflict: "payment_id", ignoreDuplicates: true });
  if (commissionError) throw commissionError;
}


type PaymentObject = {
  id?: string;
  payment?: string | PaymentObject;
  paymentId?: string;
  status?: string;
};
type AsaasEvent = {
  id?: string;
  event?: string;
  type?: string;
  payment?: string | PaymentObject;
  paymentId?: string;
  status?: string;
  data?: {
    id?: string;
    payment?: string | PaymentObject;
    paymentId?: string;
    status?: string;
    object?: PaymentObject;
  };
};

const normalizeStatus = (value: unknown) => String(value ?? "").toUpperCase();
const isPaidStatus = (status: unknown) =>
  ["CONFIRMED", "RECEIVED", "PAID", "AUTHORIZED", "APPROVED", "SETTLED", "SUCCESS"].includes(normalizeStatus(status));
const firstDefined = (...values: unknown[]) =>
  values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") ?? null;
const objectId = (value: unknown) => {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value && typeof value === "object" && "id" in value) return (value as { id?: unknown }).id;
  return null;
};
const constantTimeTokenMatch = (expected: string, received: string) => {
  if (expected.length !== received.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return mismatch === 0;
};

export const Route = createFileRoute("/api/public/asaas-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Configurar ASAAS_WEBHOOK_TOKEN com o mesmo token secreto definido no painel do Asaas.
        // Falhar fechado: sem segredo configurado, nenhuma notificação pode ativar pagamentos.
        const expectedToken = process.env["ASAAS_WEBHOOK_TOKEN"] ?? "";
        const receivedToken = request.headers.get("asaas-access-token") ?? "";
        if (
          expectedToken.length < 32 ||
          !constantTimeTokenMatch(expectedToken, receivedToken)
        ) {
          return new Response("unauthorized webhook", { status: 401 });
        }

        const body = await request.text();
        let event: AsaasEvent;
        try {
          event = JSON.parse(body) as AsaasEvent;
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        if (!event.id?.trim()) return new Response("missing event id", { status: 400 });

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        let claimedPaymentId: string | null = null;

        try {
          const { error: eventError } = await db
            .from("asaas_events")
            .insert({ id: event.id, type: event.event ?? event.type ?? "unknown" });
          if (eventError?.code === "23505") return Response.json({ received: true, duplicate: true });
          if (eventError) throw eventError;

          const paymentId = firstDefined(
            objectId(event.payment),
            event.paymentId,
            objectId(event.data?.payment),
            event.data?.paymentId,
            objectId(event.data?.object?.payment),
            event.data?.object?.paymentId,
            event.data?.object?.id,
            event.data?.id,
          );
          const paymentIdText = paymentId === null ? null : String(paymentId);
          const eventName = normalizeStatus(firstDefined(event.event, event.type));
          if (!paymentIdText) return Response.json({ received: true });
          if (eventName === "PAYMENT_DELETED" || eventName === "PAYMENT_REFUNDED") {
            return Response.json({ received: true });
          }

          const asaas = await import("@/lib/asaas.server");
          const payment = await asaas.getPayment(paymentIdText);
          const paymentStatus = normalizeStatus(payment.status);
          const confirmedEvent = [
            "PAYMENT_CONFIRMED",
            "PAYMENT_RECEIVED",
            "PAYMENT_APPROVED",
            "PAYMENT_SETTLED",
          ].includes(eventName);
          const asaasSubscriptionId = payment.subscription ?? null;

          if (!isPaidStatus(paymentStatus)) {
            if (confirmedEvent) {
              throw new Error("Asaas reported a confirmed event but the payment API has not confirmed the payment yet");
            }
            if (eventName === "PAYMENT_OVERDUE" && asaasSubscriptionId) {
              const { error: overdueError } = await db.from("subscriptions")
                .update({ status: "past_due", updated_at: new Date().toISOString() })
                .eq("asaas_subscription_id", asaasSubscriptionId);
              if (overdueError) throw overdueError;
            }
            return Response.json({ received: true });
          }

          // Use Asaas's actual collected value, already reduced by any affiliate discount.
          // The commission is never calculated from the plan's undiscounted list price.
          const actualPaidAmountCents = amountToCents(payment.value);
          const paidAt = new Date().toISOString();

          const { data: pendingCheckout, error: pendingCheckoutError } = await db
            .from("pending_billing_changes")
            .select("*")
            .eq("payment_id", paymentIdText)
            .maybeSingle();
          if (pendingCheckoutError) throw pendingCheckoutError;

          // The first Pix is intentionally a one-off so the one-time introductory
          // discount does not accidentally reduce every later monthly/yearly charge.
          if (pendingCheckout?.status === "processed") {
            return Response.json({ received: true, duplicatePayment: true });
          }

          // Asaas may emit distinct event IDs for the same payment. Claim the payment ID
          // separately so each confirmed installment extends the subscription only once.
          const staleClaimBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          const { data: existingPaymentClaim, error: existingPaymentClaimError } = await db
            .from("asaas_processed_payments")
            .select("payment_id, status, updated_at")
            .eq("payment_id", paymentIdText)
            .maybeSingle();
          if (existingPaymentClaimError) throw existingPaymentClaimError;

          if (existingPaymentClaim?.status === "processed") {
            return Response.json({ received: true, duplicatePayment: true });
          }

          if (existingPaymentClaim?.status === "processing") {
            if (Date.parse(existingPaymentClaim.updated_at) > Date.parse(staleClaimBefore)) {
              return Response.json({ received: true, duplicatePayment: true });
            }
            const { data: reclaimed, error: reclaimError } = await db.from("asaas_processed_payments")
              .update({ status: "processing", last_error: null, updated_at: new Date().toISOString() })
              .eq("payment_id", paymentIdText)
              .eq("status", "processing")
              .lt("updated_at", staleClaimBefore)
              .select("payment_id")
              .maybeSingle();
            if (reclaimError) throw reclaimError;
            if (!reclaimed) return Response.json({ received: true, duplicatePayment: true });
            claimedPaymentId = paymentIdText;
          } else if (existingPaymentClaim?.status === "failed") {
            const { data: reclaimed, error: reclaimError } = await db.from("asaas_processed_payments")
              .update({ status: "processing", last_error: null, updated_at: new Date().toISOString() })
              .eq("payment_id", paymentIdText)
              .eq("status", "failed")
              .select("payment_id")
              .maybeSingle();
            if (reclaimError) throw reclaimError;
            if (!reclaimed) return Response.json({ received: true, duplicatePayment: true });
            claimedPaymentId = paymentIdText;
          } else {
            const { error: claimError } = await db.from("asaas_processed_payments").insert({
              payment_id: paymentIdText,
              status: "processing",
              updated_at: new Date().toISOString(),
            });
            if (claimError?.code === "23505") {
              const { data: racedClaim, error: racedClaimError } = await db.from("asaas_processed_payments")
                .select("status")
                .eq("payment_id", paymentIdText)
                .maybeSingle();
              if (racedClaimError) throw racedClaimError;
              if (racedClaim?.status !== "failed") {
                return Response.json({ received: true, duplicatePayment: true });
              }
              const { data: reclaimed, error: reclaimError } = await db.from("asaas_processed_payments")
                .update({ status: "processing", last_error: null, updated_at: new Date().toISOString() })
                .eq("payment_id", paymentIdText)
                .eq("status", "failed")
                .select("payment_id")
                .maybeSingle();
              if (reclaimError) throw reclaimError;
              if (!reclaimed) return Response.json({ received: true, duplicatePayment: true });
              claimedPaymentId = paymentIdText;
            } else if (claimError) {
              throw claimError;
            } else {
              claimedPaymentId = paymentIdText;
            }
          }

          if (pendingCheckout && pendingCheckout.status !== "processed") {
            const { data: before, error: beforeError } = await db.from("subscriptions")
              .select("id, asaas_subscription_id")
              .eq("user_id", pendingCheckout.user_id)
              .maybeSingle();
            if (beforeError) throw beforeError;

            const interval: BillingInterval = pendingCheckout.billing_interval === "year" ? "year" : "month";
            const nextDueDate = nextBillingDate(paidAt, interval);
            const plan = getPlan(pendingCheckout.plan as PlanId);
            const externalReference = "cc-renewal-" + pendingCheckout.checkout_reference;
            const recurring = await asaas.createOrGetPixSubscription(
              pendingCheckout.customer_id,
              Number(pendingCheckout.recurring_amount_cents),
              nextDueDate,
              interval === "year" ? "YEARLY" : "MONTHLY",
              externalReference,
              "Critical Cash " + plan.name + (interval === "year" ? " anual" : " mensal") + " — renovação",
            );

            const previousSubscriptionId =
              pendingCheckout.previous_asaas_subscription_id || before?.asaas_subscription_id || null;
            if (previousSubscriptionId && previousSubscriptionId !== recurring.id) {
              await asaas.cancelAsaasSubscription(previousSubscriptionId);
            }

            const { data: activeSub, error: activationError } = await db.from("subscriptions").upsert({
              user_id: pendingCheckout.user_id,
              asaas_customer_id: pendingCheckout.customer_id,
              asaas_payment_id: paymentIdText,
              asaas_subscription_id: recurring.id,
              status: "active",
              paid_at: paidAt,
              current_period_end: localMidnightTimestamp(nextDueDate),
              cancel_at_period_end: false,
              plan: pendingCheckout.plan as PlanId,
              billing_interval: interval,
              affiliate_partner_id: pendingCheckout.affiliate_partner_id,
              affiliate_coupon_code: pendingCheckout.affiliate_coupon_code,
              affiliate_commission_percent: pendingCheckout.affiliate_commission_percent,
              affiliate_discount_percent: pendingCheckout.affiliate_discount_percent,
              affiliate_payment_amount_cents: pendingCheckout.recurring_amount_cents,
              updated_at: paidAt,
            }, { onConflict: "user_id" })
              .select("id, user_id, plan")
              .single();
            if (activationError) throw activationError;

            await recordAffiliateCommission(db, {
              partnerId: pendingCheckout.affiliate_partner_id,
              userId: activeSub.user_id,
              subscriptionId: activeSub.id,
              paymentId: paymentIdText,
              actualPaidAmountCents,
              commissionPercentAtAcquisition: pendingCheckout.affiliate_commission_percent,
            });

            const { error: auditError } = await db.from("audit_logs").insert({
              user_id: activeSub.user_id,
              action: "subscription_start",
              details: {
                plan: activeSub.plan,
                gateway: "asaas_pix",
                payment_id: paymentIdText,
                asaas_subscription_id: recurring.id,
              },
            });
            if (auditError) throw auditError;

            const { error: completedError } = await db.from("pending_billing_changes")
              .update({ status: "processed", paid_at: paidAt, updated_at: paidAt })
              .eq("checkout_reference", pendingCheckout.checkout_reference);
            if (completedError) throw completedError;
          } else if (asaasSubscriptionId) {
            // Every recurring charge has its own payment ID but references the same Asaas subscription.
            const { data: sub, error: subError } = await db.from("subscriptions")
              .select("id, user_id, plan, billing_interval, affiliate_partner_id, affiliate_commission_percent, affiliate_discount_percent, affiliate_payment_amount_cents, asaas_subscription_id, current_period_end")
              .eq("asaas_subscription_id", asaasSubscriptionId)
              .maybeSingle();
            if (subError) throw subError;
            if (!sub?.user_id) {
              throw new Error("No Critical Cash subscription found for Asaas recurrence " + asaasSubscriptionId);
            }

            const interval: BillingInterval = sub.billing_interval === "year" ? "year" : "month";
            const cycleBaseDate = payment.dueDate ?? sub.current_period_end ?? paidAt;
            const nextDueDate = nextBillingDate(cycleBaseDate, interval);
            const { data: renewedSub, error: renewalError } = await db.from("subscriptions")
              .update({
                status: "active",
                paid_at: paidAt,
                current_period_end: localMidnightTimestamp(nextDueDate),
                updated_at: paidAt,
              })
              .eq("id", sub.id)
              .select("id, user_id")
              .single();
            if (renewalError) throw renewalError;

            await recordAffiliateCommission(db, {
              partnerId: sub.affiliate_partner_id,
              userId: renewedSub.user_id,
              subscriptionId: renewedSub.id,
              paymentId: paymentIdText,
              actualPaidAmountCents,
              commissionPercentAtAcquisition: sub.affiliate_commission_percent,
            });

            const { error: auditError } = await db.from("audit_logs").insert({
              user_id: renewedSub.user_id,
              action: "subscription_renewal",
              details: { gateway: "asaas_pix", payment_id: paymentIdText, asaas_subscription_id: asaasSubscriptionId },
            });
            if (auditError) throw auditError;

            // Partner coupon pricing remains discounted for the subscription's recurring invoices.
            // Do not reset the Asaas recurring amount after a fixed number of payments.
          } else {
            // Compatibility for a Pix issued by the previous version before pending checkouts
            // were stored separately. We still activate it and install the new recurring cycle.
            const { data: legacySub, error: legacyError } = await db.from("subscriptions")
              .select("id, user_id, plan, billing_interval, status, paid_at, affiliate_partner_id, affiliate_coupon_code, affiliate_commission_percent, affiliate_discount_percent, affiliate_payment_amount_cents, asaas_customer_id, asaas_subscription_id")
              .eq("asaas_payment_id", paymentIdText)
              .maybeSingle();
            if (legacyError) throw legacyError;
            if (!legacySub?.user_id) {
              throw new Error("No Critical Cash subscription found for confirmed Asaas payment " + paymentIdText);
            }
            if (legacySub.status === "active" && legacySub.asaas_subscription_id) {
              const { error: claimCompleteError } = await db.from("asaas_processed_payments")
                .update({ status: "processed", last_error: null, updated_at: new Date().toISOString() })
                .eq("payment_id", paymentIdText);
              if (claimCompleteError) throw claimCompleteError;
              claimedPaymentId = null;
              return Response.json({ received: true, duplicatePayment: true });
            }
            if (!legacySub.asaas_customer_id || !legacySub.plan) {
              throw new Error("Legacy pending payment is missing its customer or plan");
            }

            const interval: BillingInterval = legacySub.billing_interval === "year" ? "year" : "month";
            const plan = getPlan(legacySub.plan as PlanId);
            const recurringDiscount = legacySub.affiliate_discount_percent ?? 0;
            const recurringAmountCents = Math.round(
              (interval === "year" ? plan.priceYearCents : plan.priceMonthCents) * (1 - recurringDiscount / 100),
            );
            const nextDueDate = nextBillingDate(paidAt, interval);
            const recurring = await asaas.createOrGetPixSubscription(
              legacySub.asaas_customer_id,
              recurringAmountCents,
              nextDueDate,
              interval === "year" ? "YEARLY" : "MONTHLY",
              "cc-renewal-legacy-" + paymentIdText,
              "Critical Cash " + plan.name + (interval === "year" ? " anual" : " mensal") + " — renovação",
            );
            if (legacySub.asaas_subscription_id && legacySub.asaas_subscription_id !== recurring.id) {
              await asaas.cancelAsaasSubscription(legacySub.asaas_subscription_id);
            }

            const { data: activeSub, error: activationError } = await db.from("subscriptions")
              .update({
                status: "active",
                paid_at: paidAt,
                asaas_subscription_id: recurring.id,
                current_period_end: localMidnightTimestamp(nextDueDate),
                cancel_at_period_end: false,
                affiliate_payment_amount_cents: recurringAmountCents,
                updated_at: paidAt,
              })
              .eq("id", legacySub.id)
              .select("id, user_id, plan")
              .single();
            if (activationError) throw activationError;

            await recordAffiliateCommission(db, {
              partnerId: legacySub.affiliate_partner_id,
              userId: activeSub.user_id,
              subscriptionId: activeSub.id,
              paymentId: paymentIdText,
              actualPaidAmountCents,
              commissionPercentAtAcquisition: legacySub.affiliate_commission_percent,
            });

            const { error: auditError } = await db.from("audit_logs").insert({
              user_id: activeSub.user_id,
              action: "subscription_start",
              details: { plan: activeSub.plan, gateway: "asaas_pix_legacy", payment_id: paymentIdText, asaas_subscription_id: recurring.id },
            });
            if (auditError) throw auditError;
          }

          if (claimedPaymentId) {
            const { error: claimCompleteError } = await db.from("asaas_processed_payments")
              .update({ status: "processed", last_error: null, updated_at: new Date().toISOString() })
              .eq("payment_id", claimedPaymentId);
            if (claimCompleteError) throw claimCompleteError;
            claimedPaymentId = null;
          }

          return Response.json({ received: true });
        } catch (error) {
          console.error("Asaas webhook processing failed", event.id, error);
          if (claimedPaymentId) {
            const { error: claimFailedError } = await db.from("asaas_processed_payments")
              .update({
                status: "failed",
                last_error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
                updated_at: new Date().toISOString(),
              })
              .eq("payment_id", claimedPaymentId)
              .eq("status", "processing");
            if (claimFailedError) console.error("Asaas payment idempotency cleanup failed", claimedPaymentId, claimFailedError);
          }
          const { error: cleanupError } = await db.from("asaas_events").delete().eq("id", event.id);
          if (cleanupError) console.error("Asaas webhook idempotency cleanup failed", event.id, cleanupError);
          return new Response("webhook processing failed", { status: 500 });
        }
      },
    },
  },
});
