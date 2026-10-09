import { describe, expect, it } from "vitest";
import { parseStatementText } from "@/lib/csv";

describe("parseStatementText", () => {
  it("converts explicit credit and debit statement lines into reviewed entries", () => {
    const result = parseStatementText(
      ["15/10/2026 PIX RECEBIDO MARIA SILVA 150,00 C", "2026-10-16 COMPRA MERCADO -89,90 D"].join(
        "\n",
      ),
    );

    expect(result.ignored).toBe(0);
    expect(result.rows.map((row) => row.value)).toEqual([
      expect.objectContaining({
        type: "income",
        description: "PIX RECEBIDO MARIA SILVA",
        amount_cents: 15000,
        due_date: "2026-10-15",
      }),
      expect.objectContaining({
        type: "expense",
        description: "COMPRA MERCADO",
        amount_cents: 8990,
        due_date: "2026-10-16",
      }),
    ]);
  });

  it("requires manual review when a line has no reliable transaction direction", () => {
    const result = parseStatementText("15/10/2026 TRANSFERÊNCIA 150,00");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].value).toBeUndefined();
    expect(result.rows[0].errors).toContain(
      "Não foi possível identificar se o lançamento é entrada ou saída.",
    );
  });

  it("keeps ambiguous lines for review and counts non-transaction lines as ignored", () => {
    const result = parseStatementText("EXTRATO DA CONTA\nSaldo em 15/10/2026");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].value).toBeUndefined();
    expect(result.ignored).toBe(1);
  });
});
