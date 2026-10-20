import { describe, expect, it } from "vitest";
import { parseMoney, parseStatementText, parseOfxText, parseBankTable } from "./csv";

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
      "10/10/2026 PIX RECEBIDO DE MARIA SILVA 1.250,00 C",
      "11/10/2026 PAGAMENTO BOLETO PARA INTERNET LTDA 189,90 D",
    ].join("\n"));

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].value).toMatchObject({
      type: "income",
      description: "PIX RECEBIDO DE MARIA SILVA",
      amount_cents: 125000,
      due_date: "2026-10-10",
      counterparty_name: "MARIA SILVA",
    });
    expect(parsed.rows[1].value).toMatchObject({
      type: "expense",
      description: "PAGAMENTO BOLETO PARA INTERNET LTDA",
      amount_cents: 18990,
      due_date: "2026-10-11",
      counterparty_name: "INTERNET LTDA",
    });
  });

  it("accepts ISO dates and leaves ambiguous transaction direction for review", () => {
    const parsed = parseStatementText("2026-10-12 TRANSACAO LOJA CENTRAL 25,90");

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].value).toBeUndefined();
    expect(parsed.rows[0].errors[0]).toContain("classifique manualmente");
    expect(parsed.rows[0].raw.vencimento).toBe("2026-10-12");
  });

  it("extracts the sender from an incoming PIX and the recipient from an outgoing PIX", () => {
    const parsed = parseStatementText([
      "10/10/2026 PIX RECEBIDO DE MARIA SILVA 1.250,00 C",
      "11/10/2026 PIX ENVIADO PARA JOAO SOUZA 189,90 D",
    ].join("\n"));

    expect(parsed.rows[0].raw.nome).toBe("MARIA SILVA");
    expect(parsed.rows[0].raw.remetente).toBe("MARIA SILVA");
    expect(parsed.rows[0].raw.destinatario).toBe("");
    expect(parsed.rows[0].value).toMatchObject({ type: "income", counterparty_name: "MARIA SILVA" });
    expect(parsed.rows[1].raw.nome).toBe("JOAO SOUZA");
    expect(parsed.rows[1].raw.remetente).toBe("");
    expect(parsed.rows[1].raw.destinatario).toBe("JOAO SOUZA");
    expect(parsed.rows[1].value).toMatchObject({ type: "expense", counterparty_name: "JOAO SOUZA" });
  });

  it("extracts both parties when a transfer description names sender and recipient", () => {
    const parsed = parseStatementText("12/10/2026 TRANSFERENCIA DE MARIA SILVA PARA JOAO SOUZA 500,00 D");
    expect(parsed.rows[0].raw.remetente).toBe("MARIA SILVA");
    expect(parsed.rows[0].raw.destinatario).toBe("JOAO SOUZA");
    expect(parsed.rows[0].raw.nome).toBe("JOAO SOUZA");
  });

  it("ignores statement headings without counting every heading as a failed transaction", () => {
    const parsed = parseStatementText("EXTRATO CONTA CORRENTE\nSALDO ANTERIOR\nAgência 0001");

    expect(parsed.rows).toHaveLength(0);
    expect(parsed.ignored).toBe(0);
  });
});


describe("parseOfxText", () => {
  it("parses OFX/QFX signed transactions and converts them to Brazilian entry types", () => {
    const parsed = parseOfxText(`<OFX>
<STMTTRN>
<DTPOSTED>20261012120000
<TRNAMT>-42.50
<NAME>PADARIA CENTRAL
<MEMO>COMPRA CARTAO
</STMTTRN>
<STMTTRN>
<DTPOSTED>20261013120000
<TRNAMT>1250.00
<NAME>PIX RECEBIDO DE CLIENTE CENTRAL
</STMTTRN>
</OFX>`);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].value).toMatchObject({ type: "expense", amount_cents: 4250, due_date: "2026-10-12", counterparty_name: "PADARIA CENTRAL" });
    expect(parsed.rows[1].value).toMatchObject({ type: "income", amount_cents: 125000, due_date: "2026-10-13", counterparty_name: "CLIENTE CENTRAL" });
  });
});

describe("parseBankTable", () => {
  it("recognizes common alternative bank CSV headers and keeps unknown direction for review", () => {
    const parsed = parseBankTable("Data;Histórico;Valor\n12/10/2026;Compra para MERCADO CENTRAL;-45,90\n13/10/2026;Movimentação recebida de CLIENTE CENTRAL;120,00");
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].value).toMatchObject({ type: "expense", amount_cents: 4590, due_date: "2026-10-12", counterparty_name: "MERCADO CENTRAL" });
    expect(parsed.rows[1].value).toBeUndefined();
    expect(parsed.rows[1].errors[0]).toContain("classifique manualmente");
  });

  it("recognizes separate debit and credit columns", () => {
    const parsed = parseBankTable("Data;Descrição;Débito;Crédito\n12/10/2026;Aluguel para IMOBILIARIA CENTRAL;1200,00;\n13/10/2026;Recebimento de CLIENTE CENTRAL;;3500,00");
    expect(parsed.rows[0].value).toMatchObject({ type: "expense", amount_cents: 120000, counterparty_name: "IMOBILIARIA CENTRAL" });
    expect(parsed.rows[1].value).toMatchObject({ type: "income", amount_cents: 350000, counterparty_name: "CLIENTE CENTRAL" });
  });
});
