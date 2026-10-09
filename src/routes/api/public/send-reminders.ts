import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Chamado diariamente às 08:00 America/Sao_Paulo (11:00 UTC) pelo pg_cron.
export const Route = createFileRoute("/api/public/send-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { runDailyReminders, runSystemEmails } = await import("@/lib/reminders.server");
        try {
          const stats = await runDailyReminders(supabaseAdmin);
          await runSystemEmails(supabaseAdmin);
          return Response.json({ ok: true, ...stats });
        } catch (e) {
          console.error("send-reminders failed", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
