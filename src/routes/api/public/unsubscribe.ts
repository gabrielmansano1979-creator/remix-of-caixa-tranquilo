import { createFileRoute } from "@tanstack/react-router";

const page = (title: string, msg: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#0f172a">
<main style="max-width:420px;margin:24px;padding:32px;background:#fff;border-radius:16px;box-shadow:0 8px 24px -8px rgba(15,23,42,.12);text-align:center">
<h1 style="font-size:20px;margin:0 0 8px">${title}</h1><p style="color:#475569;line-height:1.6;margin:0">${msg}</p></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );

async function handle(request: Request) {
  const t = new URL(request.url).searchParams.get("t") ?? "";
  if (t.length > 1000) return page("Link inválido", "Este link de descadastro não é válido.", 400);
  const { verifyUnsub } = await import("@/lib/email.server");
  const data = verifyUnsub(t);
  if (!data || !/^[0-9a-f-]{36}$/.test(data.u) || !data.e.includes("@")) return page("Link inválido", "Este link de descadastro não é válido ou expirou.", 400);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("unsubscribed_emails").upsert({ user_id: data.u, email: data.e }, { onConflict: "user_id,email" });
  if (error) return page("Algo deu errado", "Não conseguimos concluir agora. Tente novamente em instantes.", 500);
  return page("Pronto, você foi descadastrado", "Você não receberá mais lembretes de cobrança deste remetente.");
}

export const Route = createFileRoute("/api/public/unsubscribe")({
  server: { handlers: { GET: ({ request }) => handle(request), POST: ({ request }) => handle(request) } },
});
