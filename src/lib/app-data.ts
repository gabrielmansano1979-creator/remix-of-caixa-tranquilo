import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PlanId } from "@/config/plans";

export interface Access {
  plan: PlanId;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  can_write: boolean;
  trial_ends_at: string | null;
  limits: { pending_entries: number; emails_per_month: number; csv_rows: number; top_risks: number; edit_rule_days: boolean; edit_rule_texts: boolean };
}

export const accessQuery = queryOptions({
  queryKey: ["access"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("my_access");
    if (error) throw error;
    return data as unknown as Access;
  },
});

export const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: async () => {
    await supabase.rpc("ensure_user_setup");
    const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
    if (error) throw error;
    return data;
  },
});

export type Entry = {
  id: string;
  type: "income" | "expense";
  description: string;
  amount_cents: number;
  due_date: string;
  counterparty_name: string | null;
  counterparty_email: string | null;
  status: "pending" | "paid";
  paid_at: string | null;
  reminders_muted: boolean;
  created_at: string;
};

export const entriesQuery = queryOptions({
  queryKey: ["entries"],
  queryFn: async () => {
    const { data, error } = await supabase.from("entries").select("*").order("due_date", { ascending: true }).limit(5000);
    if (error) throw error;
    return data as Entry[];
  },
});

export const todaySP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const isOverdue = (e: Pick<Entry, "status" | "due_date">) => e.status === "pending" && e.due_date < todaySP();

export type LimitKind = "pending" | "csv" | "readonly";
/** Traduz erros do banco em mensagens/limites amigáveis. */
export function parseDbError(err: unknown): { kind?: LimitKind; message: string } {
  const msg = (err as { message?: string })?.message ?? "";
  if (msg.includes("READ_ONLY")) return { kind: "readonly", message: "Seu teste terminou. Assine para voltar a editar." };
  if (msg.includes("LIMIT_PENDING")) return { kind: "pending", message: "Você atingiu o limite de contas pendentes do seu plano." };
  if (msg.includes("LIMIT_CSV")) return { kind: "csv", message: "O arquivo excede o limite de linhas do seu plano." };
  if (msg.includes("EMAIL_REQUIRED")) return { message: "Informe o e-mail do cliente para contas a receber." };
  return { message: "Não foi possível salvar. Tente novamente." };
}
