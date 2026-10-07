import { z } from "zod";
import { toE164 } from "@/lib/phone";
import { formatBRL, formatDate } from "@/lib/format";

export const trialProgress = (ends: string, now = Date.now()) => {
  const remaining = Math.max(0, Math.min(7, Math.ceil((Date.parse(ends) - now) / 86400000)));
  return { remaining, day: Math.min(7, Math.max(1, 8 - remaining)) };
};

export function manualWhatsAppLink(entry: { counterparty_whatsapp: string | null; counterparty_name: string | null; amount_cents: number; due_date: string; description: string }, company: string) {
  const phone = toE164(entry.counterparty_whatsapp ?? "");
  if (!phone) return null;
  const data = z.object({ name: z.string().max(120), description: z.string().max(200), company: z.string().max(120), amount: z.number().int().positive(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse({ name: entry.counterparty_name ?? "", description: entry.description, company, amount: entry.amount_cents, date: entry.due_date });
  if (!data.success) return null;
  const message = `Olá${data.data.name ? `, ${data.data.name}` : ""}! Passando para lembrar de ${data.data.description}, no valor de ${formatBRL(data.data.amount)}, com vencimento em ${formatDate(data.data.date)}. Se já pagou, desconsidere. Obrigado! — ${company}`;
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}