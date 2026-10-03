import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookRequest } from "@lovable.dev/webhooks-js";

const RANK: Record<string, number> = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Aplica um evento salvo. Retorna false se ainda não há log correspondente (fica pendente). */
async function processEvent(admin: Admin, ev: { event: string; payload: any }): Promise<boolean> {
  if (ev.event !== "whatsapp.status") return true;
  const statuses: any[] = ev.payload?.entry?.[0]?.changes?.[0]?.value?.statuses ?? [];
  let allMatched = true;
  for (const s of statuses) {
    const { data: log, error } = await admin.from("reminder_logs").select("id, delivery_status").eq("provider_id", s.id).maybeSingle();
    if (error) throw error;
    if (!log) { allMatched = false; continue; }
    const cur = RANK[log.delivery_status ?? "accepted"] ?? 0;
    if ((RANK[s.status] ?? 0) < cur) continue;
    const at = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : null;
    const upd: any = { delivery_status: s.status, delivery_status_at: at };
    if (s.status === "failed") { upd.status = "failed"; upd.error = JSON.stringify(s.errors ?? []).slice(0, 500); }
    const { error: e2 } = await admin.from("reminder_logs").update(upd).eq("id", log.id);
    if (e2) throw e2;
  }
  return allMatched;
}

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["WHATSAPP_API_KEY"];
        if (!secret) return new Response("not configured", { status: 500 });
        let body: string;
        try {
          const v: any = await verifyWebhookRequest({ request, secret, maxBodyBytes: 4 * 1024 * 1024 } as any);
          body = typeof v === "string" ? v : v?.body ?? v?.rawBody ?? JSON.stringify(v?.payload ?? v);
        } catch { return new Response("invalid signature", { status: 401 }); }
        const deliveryId = request.headers.get("X-Lovable-Delivery");
        const event = request.headers.get("X-Lovable-Event");
        if (!deliveryId || !event) return new Response("missing headers", { status: 400 });
        let payload: unknown;
        try { payload = JSON.parse(body); } catch { return new Response("bad json", { status: 400 }); }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error: insErr } = await supabaseAdmin.from("whatsapp_webhook_events").upsert({ delivery_id: deliveryId, event, payload: payload as any }, { onConflict: "delivery_id", ignoreDuplicates: true });
        if (insErr) return new Response("db error", { status: 500 });
        // Processa este evento e até 20 pendentes antigos (recuperação), em ordem justa por tentativa.
        const { data: pending, error: selErr } = await supabaseAdmin.from("whatsapp_webhook_events").select("id, event, payload, delivery_id, received_at")
          .is("processed_at", null).order("received_at", { ascending: true }).limit(20);
        if (selErr) return new Response("db error", { status: 500 });
        const { data: cur } = await supabaseAdmin.from("whatsapp_webhook_events").select("id, event, payload, delivery_id, processed_at, received_at").eq("delivery_id", deliveryId).single();
        const list = [...(pending ?? [])];
        if (cur && !cur.processed_at && !list.some((p) => p.id === cur.id)) list.push(cur);
        let failed = false;
        for (const ev of list) {
          try {
            const done = await processEvent(supabaseAdmin, ev);
            const recvAge = Date.now() - Date.parse((ev as any).received_at ?? new Date().toISOString());
            if (done || recvAge > 3 * 86400000) await supabaseAdmin.from("whatsapp_webhook_events").update({ processed_at: new Date().toISOString(), processing_error: done ? null : "unmatched" }).eq("id", ev.id);
          } catch (e) {
            await supabaseAdmin.from("whatsapp_webhook_events").update({ processing_error: (e as Error).message }).eq("id", ev.id);
            if (ev.delivery_id === deliveryId) failed = true;
          }
        }
        return failed ? new Response("retry", { status: 500 }) : new Response("ok");
      },
    },
  },
});
