import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SYSTEM = `Você é o suporte do Critical Cash, app de previsão de caixa (15 e 30 dias) e cobranças automáticas pelo WhatsApp para microempresas e profissionais liberais.
Planos: Starter R$29/mês, Pro R$59/mês, Business R$119/mês (anual com 2 meses grátis). Há 14 dias de teste grátis. Sem cupom válido, a primeira cobrança via Pix tem 10% de desconto apenas no primeiro pagamento. Cupom válido de contador concede 20% de desconto nas duas primeiras mensalidades ou apenas no primeiro pagamento anual. A comissão do contador fica congelada por cliente na taxa vigente quando ele foi adquirido (20%, 25% ou 30%). Cancelamento a qualquer momento.
Responda em português do Brasil, curto, gentil e prático. Se não souber, peça para escrever para criticalcash2026@gmail.com.`;

export const askSupport = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) })).min(1).max(30) }).parse(d),
  )
  .handler(async ({ data }): Promise<{ reply: string }> => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { reply: "O suporte está indisponível agora. Escreva para criticalcash2026@gmail.com." };
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "system", content: SYSTEM }, ...data.messages] }),
    });
    if (res.status === 429) return { reply: "Muitas mensagens agora. Tente de novo em instantes." };
    if (!res.ok) return { reply: "Não consegui responder agora. Tente novamente ou escreva para criticalcash2026@gmail.com." };
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { reply: j.choices?.[0]?.message?.content?.trim() || "Pode reformular a pergunta?" };
  });
