import { describe, expect, it } from "vitest";
import { formatBRL, formatDate } from "@/lib/format";
import { buildWhatsAppMessage, createWhatsAppUrl } from "@/lib/whatsapp-message";

const entry = {
  counterparty_name: "Maria Silva",
  counterparty_whatsapp: "(11) 98765-4321",
  amount_cents: 15000,
  due_date: "2026-10-15",
  description: "Consultoria de outubro",
  pix_url: "https://pagamento.example/pix?id=123",
};

describe("WhatsApp message composer", () => {
  it("fills the due reminder with client data", () => {
    expect(buildWhatsAppMessage(entry, "due")).toBe(
      `Olá, Maria Silva! Tudo bem? Passando para lembrar que a sua fatura no valor de ${formatBRL(entry.amount_cents)} vence no dia ${formatDate(entry.due_date)}. Se já realizou o pagamento, favor desconsiderar esta mensagem. Abraços!`,
    );
  });

  it("fills the friendly collection with the payment link", () => {
    expect(buildWhatsAppMessage(entry, "friendly")).toBe(
      `Olá, Maria Silva! Esperamos que esteja bem. Identificamos que o pagamento referente a Consultoria de outubro no valor de ${formatBRL(entry.amount_cents)} consta em aberto. Segue o link para pagamento: ${entry.pix_url}. Qualquer dúvida, estamos à disposição!`,
    );
  });

  it("creates a WhatsApp URL with a normalized phone and encoded edited message", () => {
    const url = createWhatsAppUrl(entry, "Olá, Maria! Mensagem editada & pronta.");
    expect(url).toBe(`https://wa.me/5511987654321?text=${encodeURIComponent("Olá, Maria! Mensagem editada & pronta.")}`);
    expect(createWhatsAppUrl({ ...entry, counterparty_whatsapp: "inválido" }, "Oi")).toBeNull();
    expect(createWhatsAppUrl(entry, "  ")).toBeNull();
  });
});
