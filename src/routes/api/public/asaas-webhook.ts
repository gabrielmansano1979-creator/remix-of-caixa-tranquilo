import { createFileRoute } from "@tanstack/react-router";

type AsaasEvent = {
  id?: string;
  event?: string;
  type?: string;
  payment?: string;
  paymentId?: string;
  status?: string;
  data?: {
    id?: string;
    payment?: string;
    paymentId?: string;
    status?: string;
    object?: {
      id?: string;
      payment?: string;
      paymentId?: string;
      status?: string;
    };
  };
};

const normalizeStatus = (value: unknown) => String(value ?? "").toUpperCase();
const isPaidStatus = (status: string | undefined) => ["CONFIRMED", "RECEIVED", "PAID", "AUTHORIZED", "APPROVED", "SETTLED", "SUCCESS"].includes(normalizeStatus(status));
const firstDefined = (...values: Array<unknown>) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") ?? null;

export const Route = createFileRoute("/api/public/asaas-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        let event: AsaasEvent;
        try {
          event = JSON.parse(body);
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

        try {
          if (event.id) {
            const { error: eventError } = await db.from("asaas_events").insert({ id: event.id, type: event.event ?? event.type ?? "unknown" });
            if (eventError?.code === "23505") return Response.json({ received: true, duplicate: true });
            if (eventError) throw eventError;
          }

        const paymentId = firstDefined(
          event.payment,
          event.paymentId,
          event.data?.payment,
          event.data?.paymentId,
          event.data?.object?.payment,
          event.data?.object?.paymentId,
          event.data?.object?.id,
          event.data?.id,
        );
        const paymentIdText = paymentId === null ? null : String(paymentId);
        const status = normalizeStatus(firstDefined(
          event.status,
          event.data?.status,
          event.data?.object?.status,
          event.type,
          event.event,
        ));

        if (paymentIdText && isPaidStatus(status)) {
          const { data: sub } = await db
            .from("subscriptions")
            .select("user_id, plan, affiliate_partner_id, affiliate_commission_percent, affiliate_payment_amount_cents")
            .eq("asaas_payment_id", paymentIdText)
            .maybeSingle();

          if (sub?.user_id) {
            const { error: updateError } = await db.from("subscriptions").update({
              status: "active",
              paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }).eq("asaas_payment_id", paymentIdText);
            if (updateError) throw updateError;

            if (sub.affiliate_partner_id && sub.affiliate_commission_percent && sub.affiliate_payment_amount_cents) {
              const { data: profile } = await db.from("profiles").select("business_name").eq("user_id", sub.user_id).maybeSingle();
              const { error: commissionError } = await db.from("commissions").upsert({
                partner_id: sub.affiliate_partner_id,
                subscription_id: sub.user_id,
                payment_id: paymentIdText,
                client_name: profile?.business_name ?? "Cliente",
                amount_cents: Math.floor(sub.affiliate_payment_amount_cents * sub.affiliate_commission_percent / 100),
                status: "pending",
              }, { onConflict: "payment_id", ignoreDuplicates: true });
              if (commissionError) throw commissionError;
            }

            const { error: auditError } = await db.from("audit_logs").insert({
              user_id: sub.user_id,
              action: "subscription_start",
              meta: { plan: sub.plan, gateway: "asaas_pix" }
            });
            if (auditError) throw auditError;
          }
        }

          return Response.json({ received: true });
        } catch (error) {
          console.error("Asaas webhook processing failed", event.id, error);
          if (event.id) {
            const { error: cleanupError } = await db.from("asaas_events").delete().eq("id", event.id);
            if (cleanupError) console.error("Asaas webhook idempotency cleanup failed", event.id, cleanupError);
          }
          return new Response("webhook processing failed", { status: 500 });
        }
      },
    },
  },
});