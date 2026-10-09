// Server-only: envio de WhatsApp pela API oficial (WhatsApp Business) via conector.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/whatsapp";

export type WaResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Envia a cobrança. Se WHATSAPP_TEMPLATE_NAME estiver definido, usa o modelo aprovado pela Meta
 * (necessário para iniciar conversa) com {{1}} = texto da mensagem; senão envia texto livre
 * (só entregue se o cliente falou com você nas últimas 24h).
 */
export async function sendWhatsApp(toE164: string, body: string): Promise<WaResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const waKey = process.env["WHATSAPP_API_KEY"];
  if (!lovableKey || !waKey) return { ok: false, error: "WhatsApp Business não conectado." };
  const to = toE164.replace(/\D/g, "");
  const tpl = process.env["WHATSAPP_TEMPLATE_NAME"];
  const payload = tpl
    ? { messaging_product: "whatsapp", to, type: "template", template: { name: tpl, language: { code: process.env["WHATSAPP_TEMPLATE_LANG"] || "pt_BR" }, components: [{ type: "body", parameters: [{ type: "text", text: body.replace(/\n+/g, " ").slice(0, 1000) }] }] } }
    : { messaging_product: "whatsapp", to, type: "text", text: { body: body.slice(0, 4096) } };
  try {
    const res = await fetch(`${GATEWAY_URL}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": waKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) { console.error(`WhatsApp falhou [${res.status}]: ${text}`); return { ok: false, error: `[${res.status}] ${text.slice(0, 300)}` }; }
    const j = JSON.parse(text) as { messages?: { id: string }[] };
    return { ok: true, id: j.messages?.[0]?.id ?? "" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
