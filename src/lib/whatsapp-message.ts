import { formatBRL, formatDate } from "@/lib/format";
import { toE164 } from "@/lib/phone";

export type WhatsAppTemplate = "due" | "friendly";

export type WhatsAppEntry = {
  counterparty_name: string | null;
  counterparty_whatsapp: string | null;
  amount_cents: number;
  due_date: string;
  description: string;
  pix_url?: string | null;
};

export function buildWhatsAppMessage(entry: WhatsAppEntry, template: WhatsAppTemplate) {
  const name = entry.counterparty_name?.trim() || "cliente";
  const amount = formatBRL(entry.amount_cents);
  const dueDate = formatDate(entry.due_date);

  if (template === "due") {
    return `Olá, ${name}! Tudo bem? Passando para lembrar que a sua fatura no valor de ${amount} vence no dia ${dueDate}. Se já realizou o pagamento, favor desconsiderar esta mensagem. Abraços!`;
  }

  const link = entry.pix_url?.trim() || "não informado";
  return `Olá, ${name}! Esperamos que esteja bem. Identificamos que o pagamento referente a ${entry.description} no valor de ${amount} consta em aberto. Segue o link para pagamento: ${link}. Qualquer dúvida, estamos à disposição!`;
}

export function createWhatsAppUrl(entry: WhatsAppEntry, message: string) {
  const phone = toE164(entry.counterparty_whatsapp ?? "");
  if (!phone || !message.trim()) return null;
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}
