import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PlanId } from "@/config/plans";

export interface Access {
  plan: PlanId;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired" | "pending_pix";
  can_write: boolean;
  trial_ends_at: string | null;
  has_subscription?: boolean;
  grace_ends_at?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  billing_interval?: "month" | "year" | null;
  limits: { pending_entries: number; csv_rows: number; top_risks: number; edit_rule_days: boolean; edit_rule_texts: boolean };
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
    const { error: setupError } = await supabase.rpc("ensure_user_setup");
    if (setupError) {
      console.error("[Onboarding] Falha ao preparar perfil:", setupError);
      throw new Error("Não foi possível preparar seu perfil. Faça login novamente e tente outra vez.");
    }

    const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
    if (error) {
      console.error("[Onboarding] Falha ao carregar perfil:", error);
      throw error;
    }
    if (!data) {
      throw new Error("Seu perfil não foi criado. Saia da conta e entre novamente.");
    }
    return data;
  },
});

export const usageQuery = queryOptions({
  queryKey: ["usage"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("my_usage");
    if (error) throw error;
    return data as unknown as { pending_entries: number };
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
  counterparty_whatsapp: string | null;
  is_own_transfer?: boolean;
  payment_method?: string | null;
  sender_name?: string | null;
  recipient_name?: string | null;
  counterparty_document?: string | null;
  counterparty_original_name?: string | null;
  pix_url?: string | null;
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
  if (msg.includes("RATE_LIMIT")) return { message: "Muitas importações em pouco tempo. Aguarde alguns minutos." };
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) return { message: "Sem conexão. Verifique sua internet e tente de novo." };
  if (msg.includes("WHATSAPP_REQUIRED")) return { message: "Informe o WhatsApp do cliente (com DDD) para contas a receber." };
  return { message: "Não foi possível salvar. Tente novamente." };
}
