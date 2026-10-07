import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const entry = z.object({
  description: z.string().trim().min(1).max(200), amount_cents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v + "T12:00:00Z"); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v; }),
  counterparty_name: z.string().trim().max(120).default(""), counterparty_email: z.string().trim().email().max(255).or(z.literal("")).default(""),
  counterparty_whatsapp: z.string().regex(/^\+[1-9][0-9]{9,14}$/).or(z.literal("")).default(""),
});
export const saveFirstEntries = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ balance: z.number().int().min(-1e12).max(1e12), expense: entry, income: entry }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: p, error: profileError } = await supabase.from("profiles").select("onboarding_done").single();
    if (profileError || !p || p.onboarding_done) return { ok: false, message: "Primeiros passos indisponíveis." };
    const { data: existing, error: countError } = await supabase.from("entries").select("id").limit(1);
    if (countError) return { ok: false, message: "Não foi possível conferir suas contas." };
    const { error: balanceError } = await supabase.from("profiles").update({ initial_balance_cents: data.balance }).eq("user_id", context.userId);
    if (balanceError) return { ok: false, message: "Não foi possível salvar o saldo." };
    if (!existing?.length) {
      const rows = ([['expense', data.expense], ['income', data.income]] as const).map(([type,e]) => ({ ...e, type, counterparty_email: e.counterparty_email || null, counterparty_whatsapp: e.counterparty_whatsapp || null, counterparty_name: e.counterparty_name || null }));
      const { error } = await supabase.from("entries").insert(rows);
      if (error) return { ok: false, message: "Não foi possível salvar os lançamentos. Confira os valores." };
    }
    return { ok: true, message: "Saldo e lançamentos salvos." };
  });