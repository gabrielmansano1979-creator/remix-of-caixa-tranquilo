import { describe, expect, it } from "vitest";
import { parseMoney, parseStatementText } from "./csv";

describe("parseMoney", () => {
  it("parses Brazilian decimal and thousands separators", () => {
    expect(parseMoney("R$ 1.234,56")).toBe(123456);
    expect(parseMoney("250,00")).toBe(25000);
  });

  it("parses international decimal notation", () => {
    expect(parseMoney("1,234.56")).toBe(123456);
  });
});

describe("parseStatementText", () => {
  it("extracts credit and debit transactions from common statement rows", () => {
    const parsed = parseStatementText([
      "10/10/2026 PIX RECEBIDO MARIA SILVA 1.250,00 C",
      "11/10/2026 PAGAMENTO BOLETO INTERNET 189,90 D",
    ].join("\n"));

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].value).toMatchObject({
      type: "income",
      description: "PIX RECEBIDO MARIA SILVA",
      amount_cents: 125000,
      due_date: "2026-10-10",
    });
    expect(parsed.rows[1].value).toMatchObject({
      type: "expense",
      description: "PAGAMENTO BOLETO INTERNET",
      amount_cents: 18990,
      due_date: "2026-10-11",
    });
  });

  it("accepts ISO dates and leaves ambiguous transaction direction for review", () => {
    const parsed = parseStatementText("2026-10-12 TRANSACAO LOJA CENTRAL 25,90");

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].value).toBeUndefined();
    expect(parsed.rows[0].errors[0]).toContain("classifique manualmente");
    expect(parsed.rows[0].raw.vencimento).toBe("2026-10-12");
  });

  it("ignores statement headings without counting every heading as a failed transaction", () => {
    const parsed = parseStatementText("EXTRATO CONTA CORRENTE\nSALDO ANTERIOR\nAgência 0001");

    expect(parsed.rows).toHaveLength(0);
    expect(parsed.ignored).toBe(0);
  });
});
