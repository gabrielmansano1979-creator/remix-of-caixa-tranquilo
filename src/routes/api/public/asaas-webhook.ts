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

        if (event.id) {
          const { error: dup } = await db.from("asaas_events").insert({ id: event.id, type: event.event ?? event.type ?? "unknown" });
          if (dup) return Response.json({ received: true, duplicate: true });
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
        const status = normalizeStatus(firstDefined(
          event.status,
          event.data?.status,
          event.data?.object?.status,
          event.type,
          event.event,
        ));

        if (paymentId && isPaidStatus(status)) {
          const { data: sub } = await db
            .from("subscriptions")
            .select("user_id, plan")
            .eq("asaas_payment_id", paymentId)
            .maybeSingle();

          if (sub?.user_id) {
            await db.from("subscriptions").update({
              status: "active",
              paid_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }).eq("asaas_payment_id", paymentId);

            await db.from("audit_logs").insert({
              user_id: sub.user_id,
              action: "subscription_start",
              meta: { plan: sub.plan, gateway: "asaas_pix" }
            });
          }
        }

        return Response.json({ received: true });
      },
    },
  },
});