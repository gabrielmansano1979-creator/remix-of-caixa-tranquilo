import { formatBRL, formatDate } from "@/lib/format";
import { toE164 } from "@/lib/phone";

export type WhatsAppTemplate = "pre_due" | "due" | "overdue" | "friendly";

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
  const description = entry.description.trim() || "o valor combinado";
  const link = entry.pix_url?.trim();

  switch (template) {
    case "pre_due":
      return `Olá, ${name}! Tudo bem? Passando para avisar com antecedência que ${description} no valor de ${amount} vence em ${dueDate}. ${link ? `Link para pagamento: ${link}. ` : ""}Qualquer dúvida, estou à disposição!`;
    case "due":
      return `Olá, ${name}! Tudo bem? Hoje vence ${description}, no valor de ${amount}. ${link ? `Link para pagamento: ${link}. ` : ""}Se já realizou o pagamento, por favor desconsidere esta mensagem. Obrigado!`;
    case "overdue":
      return `Olá, ${name}! Tudo bem? Verifiquei que ${description}, no valor de ${amount}, com vencimento em ${dueDate}, ainda consta em aberto. ${link ? `Segue o link para facilitar o pagamento: ${link}. ` : ""}Caso já tenha pago, por favor desconsidere e me avise para atualizar o registro. Obrigado!`;
    case "friendly":
      return `Olá, ${name}! Espero que esteja bem. Estou entrando em contato de forma amigável sobre ${description}, no valor de ${amount}, com vencimento em ${dueDate}. ${link ? `Segue o link para pagamento: ${link}. ` : ""}Se precisar de alguma informação, conte comigo!`;
  }
}

export function createWhatsAppUrl(entry: WhatsAppEntry, message: string) {
  const phone = toE164(entry.counterparty_whatsapp ?? "");
  if (!phone || !message.trim()) return null;
  return `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}
