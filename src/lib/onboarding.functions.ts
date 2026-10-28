import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const entry = z.object({
  description: z.string().trim().min(1).max(200), amount_cents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v + "T12:00:00Z"); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v; }),
  counterparty_name: z.string().trim().max(120).default(""),
  counterparty_whatsapp: z.string().regex(/^\+[1-9][0-9]{9,14}$/, "Informe o WhatsApp no formato internacional.").or(z.literal("")),
});
export const saveFirstEntries = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ balance: z.number().int().min(-1e12).max(1e12), expense: entry, income: entry }).superRefine((value, ctx) => { if (!value.income.counterparty_whatsapp) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["income", "counterparty_whatsapp"], message: "Informe o WhatsApp do cliente com DDD." }); }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: p, error: profileError } = await supabase.from("profiles").select("onboarding_done").single();
    if (profileError || !p || p.onboarding_done) return { ok: false, message: "Primeiros passos indisponíveis." };
    // O onboarding deve sempre gravar os lançamentos escolhidos pelo usuário.
    // Não usar a existência de qualquer lançamento como motivo para ignorar os novos:
    // a pessoa pode ter importado um extrato e depois cadastrar as primeiras contas manualmente.
    const rows = ([['expense', data.expense], ['income', data.income]] as const).map(([type, e]) => ({
      ...e,
      type,
      counterparty_whatsapp: e.counterparty_whatsapp || null,
      counterparty_name: e.counterparty_name || null,
    }));
    const { error: balanceError } = await supabase.from("profiles").update({ initial_balance_cents: data.balance }).eq("user_id", context.userId);
    if (balanceError) {
      console.error("[Onboarding] Falha ao salvar saldo inicial:", balanceError);
      return { ok: false, message: "Não foi possível salvar o saldo inicial. Tente novamente." };
    }
    const { error: entriesError } = await supabase.from("entries").insert(rows);
    if (entriesError) {
      console.error("[Onboarding] Falha ao salvar lançamentos iniciais:", entriesError);
      const dbMessage = String((entriesError as { message?: string }).message ?? "");
      if (dbMessage.includes("WHATSAPP_REQUIRED")) {
        return { ok: false, message: "Para salvar a conta a receber, informe o WhatsApp do cliente com DDD." };
      }
      if (dbMessage.includes("LIMIT_PENDING") || dbMessage.includes("LIMIT_CSV")) {
        return { ok: false, message: "Você atingiu o limite de lançamentos pendentes do seu plano." };
      }
      if (dbMessage.includes("READ_ONLY")) {
        return { ok: false, message: "Seu período de acesso terminou. Escolha um plano para continuar cadastrando lançamentos." };
      }
      return { ok: false, message: "Não foi possível salvar os lançamentos iniciais. Confira o WhatsApp do cliente, os valores e os limites do plano." };
    }
    return { ok: true, message: "Saldo e lançamentos salvos." };
  });