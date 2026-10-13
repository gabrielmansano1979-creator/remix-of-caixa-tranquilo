import { createFileRoute } from "@tanstack/react-router";
import { commissionRateForConfirmedClients } from "@/lib/affiliate-commission";

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
          const rawStatus = firstDefined(
            event.status,
            event.payment && typeof event.payment === "object" ? event.payment.status : null,
            event.data?.status,
            event.data?.payment && typeof event.data.payment === "object" ? event.data.payment.status : null,
            event.data?.object?.status,
          );
          const eventName = normalizeStatus(firstDefined(event.event, event.type));
          const confirmedEvent = [
            "PAYMENT_CONFIRMED",
            "PAYMENT_RECEIVED",
            "PAYMENT_APPROVED",
            "PAYMENT_SETTLED",
          ].includes(eventName);

          if (paymentIdText && (isPaidStatus(rawStatus) || confirmedEvent)) {
            const { data: sub, error: subError } = await db
              .from("subscriptions")
              .select("user_id, plan, affiliate_partner_id, affiliate_commission_percent, affiliate_payment_amount_cents")
              .eq("asaas_payment_id", paymentIdText)
              .maybeSingle();
            if (subError) throw subError;
            // Do not acknowledge and permanently deduplicate a confirmed payment before its
            // subscription row exists. Return 500 after cleanup so Asaas can retry delivery.
            if (!sub?.user_id) {
              throw new Error("No subscription found for confirmed Asaas payment " + paymentIdText);
            }

            if (sub?.user_id) {
              const paidAt = new Date().toISOString();
              const { error: updateError } = await db
                .from("subscriptions")
                .update({ status: "active", paid_at: paidAt, updated_at: paidAt })
                .eq("asaas_payment_id", paymentIdText);
              if (updateError) throw updateError;

              if (sub.affiliate_partner_id && sub.affiliate_payment_amount_cents) {
                const partnerId = sub.affiliate_partner_id;
                const { data: partner, error: partnerError } = await db
                  .from("partner_requests")
                  .select("status, pix_type, pix_key")
                  .eq("user_id", partnerId)
                  .maybeSingle();
                if (partnerError) throw partnerError;

                // Um cliente só entra na meta depois do primeiro pagamento confirmado.
                const { count: confirmedClients, error: countError } = await db
                  .from("subscriptions")
                  .select("user_id", { count: "exact", head: true })
                  .eq("affiliate_partner_id", partnerId)
                  .not("paid_at", "is", null);
                if (countError) throw countError;
                const commissionRate = commissionRateForConfirmedClients(confirmedClients ?? 0);

                if (partner?.status === "approved" && partner.pix_type && partner.pix_key) {
                  const { error: couponError } = await db
                    .from("coupons")
                    .update({ commission_percent: commissionRate, is_active: true, updated_at: paidAt })
                    .eq("partner_id", partnerId);
                  if (couponError) throw couponError;

                  const { error: rateError } = await db
                    .from("subscriptions")
                    .update({ affiliate_commission_percent: commissionRate })
                    .eq("user_id", sub.user_id);
                  if (rateError) throw rateError;

                  const { data: profile, error: profileError } = await db
                    .from("profiles")
                    .select("full_name, business_name, email")
                    .eq("user_id", sub.user_id)
                    .maybeSingle();
                  if (profileError) throw profileError;
                  const { data: authResult } = await db.auth.admin.getUserById(sub.user_id);
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

                  const amountCents = Math.floor(
                    Number(sub.affiliate_payment_amount_cents) * commissionRate / 100,
                  );
                  const { error: commissionError } = await db.from("commissions").upsert({
                    partner_id: partnerId,
                    subscription_id: sub.user_id,
                    payment_id: paymentIdText,
                    client_name: clientName,
                    client_email: profile?.email ?? authResult.user?.email ?? null,
                    // Keep the legacy numeric column populated while newer reports use integer cents.
                    amount: amountCents / 100,
                    amount_cents: amountCents,
                    status: "pending",
                  }, { onConflict: "payment_id", ignoreDuplicates: true });
                  if (commissionError) throw commissionError;
                }
              }

              const { error: auditError } = await db.from("audit_logs").insert({
                user_id: sub.user_id,
                action: "subscription_start",
                meta: { plan: sub.plan, gateway: "asaas_pix" },
              });
              if (auditError) throw auditError;
            }
          }

          return Response.json({ received: true });
        } catch (error) {
          console.error("Asaas webhook processing failed", event.id, error);
          const { error: cleanupError } = await db.from("asaas_events").delete().eq("id", event.id);
          if (cleanupError) console.error("Asaas webhook idempotency cleanup failed", event.id, cleanupError);
          return new Response("webhook processing failed", { status: 500 });
        }
      },
    },
  },
});
