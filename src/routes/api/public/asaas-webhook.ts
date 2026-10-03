import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/asaas-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        let event: any;
        try {
          event = JSON.parse(body);
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
        const { sendSystemTo } = await import("@/lib/reminders.server");

        // Idempotência
        if (event.id) {
          const { error: dup } = await db.from("asaas_events").insert({ id: event.id, type: event.event ?? event.type });
          if (dup) return Response.json({ received: true, duplicate: true });
        }

        const paymentId = event.payment ?? event.data?.payment;
        const status = event.status ?? event.data?.status;

        if (paymentId && (status === "CONFIRMED" || status === "RECEIVED")) {
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

            await sendSystemTo(db, sub.user_id, "subscription_confirmed");
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