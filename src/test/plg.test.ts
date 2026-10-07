import { describe, expect, it } from "vitest";
import { trialProgress, manualWhatsAppLink } from "@/lib/plg";
import { parseCsv } from "@/lib/csv";
import { TRIAL_DAYS, getPlan } from "@/config/plans";

describe("PLG rules", () => {
  it("offers a seven-day trial and calculates its banner", () => {
    const now = Date.parse("2026-10-07T12:00:00Z");
    expect(TRIAL_DAYS).toBe(7);
    expect(trialProgress("2026-10-14T12:00:00Z", now)).toEqual({ day: 1, remaining: 7 });
    expect(trialProgress("2026-10-09T12:00:00Z", now)).toEqual({ day: 6, remaining: 2 });
    expect(trialProgress("2026-10-01T12:00:00Z", now).remaining).toBe(0);
  });
  it("accepts email-only CSV accounts", () => {
    const { rows } = parseCsv("descricao,valor,vencimento,tipo,nome,email\nServiço,150,15/10/2026,entrada,Maria,maria@example.com");
    expect(rows[0]?.errors).toEqual([]);
    expect(rows[0]?.value?.counterparty_email).toBe("maria@example.com");
  });
  it("validates phones and encodes manual collection messages", () => {
    const e = { counterparty_whatsapp: "(11) 98765-4321", counterparty_name: "Ana & João", amount_cents: 15000, due_date: "2026-10-15", description: "Serviço & projeto" };
    const link = manualWhatsAppLink(e, "Studio");
    expect(link).toMatch(/^https:\/\/wa.me\/5511987654321\?text=/);
    expect(link).toContain("%26");
    expect(manualWhatsAppLink({ ...e, counterparty_whatsapp: "invalid" }, "Studio")).toBeNull();
  });
  it("keeps multichannel in the paid Pro offer", () => {
    expect(getPlan("pro").features).toContain("Lembretes por E-mail e WhatsApp");
  });
});