// Server-only: envio de mensagens de WhatsApp via Twilio (conector).
const GATEWAY_URL = "https://connector-gateway.lovable.dev/twilio";

export type WaResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Envia uma mensagem de WhatsApp. Se TWILIO_WHATSAPP_CONTENT_SID estiver definido, usa o modelo
 * aprovado pelo WhatsApp (obrigatório para iniciar conversa fora da janela de 24h) com a variável {{1}} = texto.
 */
export async function sendWhatsApp(to: string, body: string): Promise<WaResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const twilioKey = process.env["TWILIO_API_KEY"];
  const from = process.env["TWILIO_WHATSAPP_FROM"];
  if (!lovableKey || !twilioKey) return { ok: false, error: "WhatsApp (Twilio) não conectado." };
  if (!from) return { ok: false, error: "Número remetente do WhatsApp (TWILIO_WHATSAPP_FROM) não configurado." };
  const params = new URLSearchParams({ To: `whatsapp:${to}`, From: `whatsapp:${from.replace(/^whatsapp:/, "")}` });
  const contentSid = process.env["TWILIO_WHATSAPP_CONTENT_SID"];
  if (contentSid) { params.set("ContentSid", contentSid); params.set("ContentVariables", JSON.stringify({ 1: body })); }
  else params.set("Body", body.slice(0, 1600));
  try {
    const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": twilioKey, "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const text = await res.text();
    if (!res.ok) { console.error(`Twilio WhatsApp falhou [${res.status}]: ${text}`); return { ok: false, error: `[${res.status}] ${text.slice(0, 300)}` }; }
    const j = JSON.parse(text) as { sid?: string };
    return { ok: true, id: j.sid ?? "" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
