import { createFileRoute } from "@tanstack/react-router";

type Sub = { id: string; customer: string; status: string; cancel_at_period_end: boolean; current_period_end?: number; metadata?: { user_id?: string }; items: { data: { price: { id: string }; current_period_end?: number }[] } };
type StripeEventObject = Partial<Sub> & {
  subscription?: string | null;
  client_reference_id?: string | null;
  parent?: { subscription_details?: { subscription?: string | null } };
};

const mapStatus = (s: string) =>
  s === "active" || s === "trialing" ? "active" : s === "past_due" || s === "unpaid" || s === "incomplete" ? "past_due" : s === "canceled" ? "canceled" : "expired";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return new Response("not configured", { status: 500 });
        const body = await request.text();
        const { verifyStripeSignature, stripe, planFromPrice } = await import("@/lib/stripe.server");
        if (!verifyStripeSignature(body, request.headers.get("stripe-signature") ?? "", secret)) return new Response("invalid signature", { status: 400 });
        const event = JSON.parse(body) as { id: string; type: string; data: { object: StripeEventObject } };
        const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

        // Idempotência: ignora eventos já processados.
        const { error: dup } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
        if (dup) return Response.json({ received: true, duplicate: true });

        const userFor = async (customer: string, meta?: string) => {
          if (meta) return meta;
          const { data } = await db.from("subscriptions").select("user_id").eq("stripe_customer_id", customer).maybeSingle();
          return data?.user_id ?? null;
        };
        const upsertSub = async (sub: Sub) => {
          const userId = await userFor(sub.customer, sub.metadata?.user_id);
          if (!userId) return null;
          const item = sub.items.data[0];
          const pp = item ? planFromPrice(item.price.id) : null;
          const end = sub.current_period_end ?? item?.current_period_end;
          await db.from("subscriptions").upsert({
            user_id: userId, stripe_customer_id: sub.customer, stripe_subscription_id: sub.id,
            plan: pp?.plan ?? null, billing_interval: pp?.interval ?? null, status: mapStatus(sub.status),
            current_period_end: end ? new Date(end * 1000).toISOString() : null,
            cancel_at_period_end: sub.cancel_at_period_end, updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
          return userId;
        };

        try {
          const o = event.data.object;
          switch (event.type) {
            case "checkout.session.completed": {
              if (o.subscription) {
                if (o.client_reference_id) await db.from("subscriptions").upsert({ user_id: o.client_reference_id, stripe_customer_id: o.customer, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
                const sub = await stripe<Sub>("GET", `subscriptions/${o.subscription}`);
                const uid = await upsertSub(sub);
                if (uid) await db.from("audit_logs").insert({ user_id: uid, action: "subscription_start", meta: { plan: sub.items.data[0]?.price.id } });
              }
              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted":
              await upsertSub(o as Sub);
              break;
            case "invoice.paid":
            case "invoice.payment_failed": {
              const subId = o.subscription ?? o.parent?.subscription_details?.subscription;
              if (subId) {
                const sub = await stripe<Sub>("GET", `subscriptions/${subId}`);
                await upsertSub(sub);
              }
              break;
            }
          }
        } catch (e) {
          console.error("webhook handling failed", event.type, e);
          await db.from("stripe_events").delete().eq("id", event.id); // permite reprocessar no retry do Stripe
          return new Response("error", { status: 500 });
        }
        return Response.json({ received: true });
      },
    },
  },
});
