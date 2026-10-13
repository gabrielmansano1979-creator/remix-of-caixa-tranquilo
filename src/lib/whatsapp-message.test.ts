import { describe, expect, it } from "vitest";
import { formatBRL, formatDate } from "@/lib/format";
import { buildCustomWhatsAppMessage, createWhatsAppUrl, type WhatsAppEntry } from "./whatsapp-message";

const entry: WhatsAppEntry = {
  counterparty_name: "Ana Souza",
  counterparty_whatsapp: "+55 (11) 99999-0000",
  amount_cents: 12345,
  due_date: "2026-10-15",
  description: "Consultoria mensal",
  pix_url: "https://pagamentos.example/pix/abc",
};

describe("WhatsApp message preview and sending", () => {
  it("renders saved reminder placeholders using the selected account data", () => {
    const message = buildCustomWhatsAppMessage(
      entry,
      "Olá, {{cliente}}!\n{{empresa}}: {{descricao}} de {{valor}}, vence {{vencimento}}. Pague em {{link_pix}}.",
      "Critical Cash",
    );

    expect(message).toBe(
      `Olá, Ana Souza!\nCritical Cash: Consultoria mensal de ${formatBRL(12345)}, vence ${formatDate("2026-10-15")}. Pague em https://pagamentos.example/pix/abc.`,
    );
    expect(message).not.toContain("{{");
  });

  it("encodes and sends exactly the editable text, preserving line breaks and punctuation", () => {
    const editedMessage = "Oi, Ana!\nO valor mudou para R$ 99,90.\nResponda por aqui, por favor :)";
    const url = createWhatsAppUrl(entry, editedMessage);

    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.hostname).toBe("wa.me");
    expect(parsed.pathname).toBe("/5511999990000");
    expect(parsed.searchParams.get("text")).toBe(editedMessage);
  });

  it("does not create a WhatsApp URL without a phone number or message", () => {
    expect(createWhatsAppUrl({ ...entry, counterparty_whatsapp: null }, "cobrança")).toBeNull();
    expect(createWhatsAppUrl(entry, "  ")).toBeNull();
  });
});
