import { describe, expect, it } from "vitest";
import { parseMoney, parseStatementText, parseCoraStatementText, parsePdfStatementText, parseOfxText, parseBankTable } from "./csv";

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

  it("recognizes English and international bank statement headers", () => {
    const parsed = parseBankTable([
      "Posting Date,Transaction Details,Withdrawals,Deposits,Running Balance",
      "2026-10-14,PIX received from ALPHA CUSTOMER,,875.40,3210.00",
      "2026-10-15,Payment to BETA SUPPLIER,129.90,,3080.10",
    ].join("\n"));
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].value).toMatchObject({
      type: "income", amount_cents: 87540, due_date: "2026-10-14",
      counterparty_name: "ALPHA CUSTOMER",
    });
    expect(parsed.rows[1].value).toMatchObject({
      type: "expense", amount_cents: 12990, due_date: "2026-10-15",
      counterparty_name: "BETA SUPPLIER",
    });
  });

  it("recognizes common alternative Brazilian headers with punctuation and explicit parties", () => {
    const parsed = parseBankTable([
      "Data da transação;Histórico da movimentação;Valor da operação;Nome do pagador;Nome do destinatário",
      "16/10/2026;PIX recebido de CLIENTE DELTA;250,00;CLIENTE DELTA;",
      "17/10/2026;PIX enviado para FORNECEDOR ÉPSILON;-89,90;;FORNECEDOR ÉPSILON",
    ].join("\n"));
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].value).toMatchObject({
      type: "income", amount_cents: 25000, counterparty_name: "CLIENTE DELTA",
    });
    expect(parsed.rows[1].value).toMatchObject({
      type: "expense", amount_cents: 8990, counterparty_name: "FORNECEDOR ÉPSILON",
    });
  });

  it("recognizes separate debit and credit columns", () => {
    const parsed = parseBankTable("Data;Descrição;Débito;Crédito\n12/10/2026;Aluguel para IMOBILIARIA CENTRAL;1200,00;\n13/10/2026;Recebimento de CLIENTE CENTRAL;;3500,00");
    expect(parsed.rows[0].value).toMatchObject({ type: "expense", amount_cents: 120000, counterparty_name: "IMOBILIARIA CENTRAL" });
    expect(parsed.rows[1].value).toMatchObject({ type: "income", amount_cents: 350000, counterparty_name: "CLIENTE CENTRAL" });
  });
});


describe("parsePdfStatementText", () => {
  it("finds a table header after PDF metadata and distinguishes debit, credit and running balance columns", () => {
    const pdfText = [
      "EXTRATO DE CONTA CORRENTE",
      "Período: 01/10/2026 a 31/10/2026",
      "Data\tHistórico\tDébito (R$)\tCrédito (R$)\tSaldo (R$)",
      "10/10/2026\tPIX recebido de MARIA SILVA\t\t1.250,00\t2.000,00",
      "11/10/2026\tPagamento para INTERNET LTDA\t189,90\t\t1.810,10",
    ].join("\n");
    const parsed = parsePdfStatementText(pdfText);

    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].value).toMatchObject({
      type: "income",
      amount_cents: 125000,
      due_date: "2026-10-10",
      counterparty_name: "MARIA SILVA",
    });
    expect(parsed.rows[1].value).toMatchObject({
      type: "expense",
      amount_cents: 18990,
      due_date: "2026-10-11",
      counterparty_name: "INTERNET LTDA",
    });
  });

  it("recognizes a single transaction amount column without mistaking the balance column for the amount", () => {
    const pdfText = [
      "Extrato",
      "Data\tDescrição\tValor (R$)\tSaldo (R$)",
      "12/10/2026\tPIX recebido de CLIENTE CENTRAL\t350,00\t2.160,10",
    ].join("\n");
    const parsed = parsePdfStatementText(pdfText);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].value).toMatchObject({
      type: "income",
      amount_cents: 35000,
      due_date: "2026-10-12",
      counterparty_name: "CLIENTE CENTRAL",
    });
  });
});


describe("additional PDF layout regression cases", () => {
  it("parses aligned PDF columns separated by multiple spaces instead of tabs", () => {
    const pdfText = [
      "EXTRATO BANCÁRIO",
      "Data do lançamento    Histórico da transação    Valor da transação    Saldo disponível",
      "14/10/2026    PIX recebido de CLIENTE ALFA    875,40    3.210,00",
      "15/10/2026    Pagamento para FORNECEDOR BETA    -129,90    3.080,10",
    ].join("\n");
    const parsed = parsePdfStatementText(pdfText);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].value).toMatchObject({
      type: "income", amount_cents: 87540, due_date: "2026-10-14", counterparty_name: "CLIENTE ALFA",
    });
    expect(parsed.rows[1].value).toMatchObject({
      type: "expense", amount_cents: 12990, due_date: "2026-10-15", counterparty_name: "FORNECEDOR BETA",
    });
  });

  it("never treats a balance-only column as the transaction amount", () => {
    const pdfText = [
      "Extrato de movimentações",
      "Data    Histórico    Saldo disponível",
      "16/10/2026    Saldo anterior    2.500,00",
    ].join("\n");
    const parsed = parsePdfStatementText(pdfText);
    expect(parsed.rows).toHaveLength(0);
    expect(parsed.headerError).toContain("saldo");
  });

  it("keeps ambiguous PDF transaction direction out of valid imports", () => {
    const pdfText = [
      "Extrato",
      "Data\tDescrição\tValor",
      "17/10/2026\tMovimentação CLIENTE GAMA\t75,00",
    ].join("\n");
    const parsed = parsePdfStatementText(pdfText);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].value).toBeUndefined();
    expect(parsed.rows[0].errors.join(" ")).toContain("classifique manualmente");
  });
});


describe("generic multi-line PDF statement layouts", () => {
  it("parses a statement whose date, operation, counterparty and signed amount are separate lines", () => {
    const parsed = parsePdfStatementText([
      "EXTRATO DE MOVIMENTAÇÕES",
      "23/09/2026",
      "PIX enviado",
      "CINTIA CRISTINA BUENO",
      "023.779.447-01",
      "- R$ 94,00",
      "17/09/2026",
      "PIX recebido",
      "CLIENTE ALFA",
      "+ R$ 250,00",
    ].join("\n"));
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].value).toMatchObject({
      type: "expense", amount_cents: 9400, due_date: "2026-09-23",
      counterparty_name: "CINTIA CRISTINA BUENO",
    });
    expect(parsed.rows[1].value).toMatchObject({
      type: "income", amount_cents: 25000, due_date: "2026-09-17",
      counterparty_name: "CLIENTE ALFA",
    });
  });

  it("does not guess between a transaction amount and balance when an unheaded row has multiple amounts", () => {
    const parsed = parsePdfStatementText([
      "23/09/2026",
      "PIX recebido de CLIENTE ALFA",
      "R$ 250,00  R$ 1.250,00",
    ].join("\n"));
    expect(parsed.rows).toHaveLength(0);
  });
});

describe("parseCoraStatementText", () => {
  const header = [
    "Cora SCFI - CNPJ 37.880.206/0001-63",
    "45.025.412 FERNANDA BUENO MANSANO (CNPJ 45.025.412/0001-14)",
    "Saldo inicial disponível R$ 1.000,00",
    "Total de entradas R$ 300,00",
    "Total de saídas R$ 1.128,00",
    "Saldo final disponível R$ 172,00",
  ].join("\n");

  it("parses a multi-line incoming PIX and ignores daily balances", () => {
    const parsed = parseCoraStatementText(header + "\n" + [
      "15/09/2026",
      "Transf Pix recebida",
      "GESI DINIZ DE OLIV...",
      "467.250.167-15",
      "+ R$ 50,00",
      "Saldo do dia R$ 584,15",
    ].join("\n"));

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].value).toMatchObject({
      type: "income", amount_cents: 5000, due_date: "2026-09-15",
      counterparty_name: "GESI DINIZ DE OLIV",
    });
    expect(parsed.rows[0].raw.remetente).toBe("GESI DINIZ DE OLIV");
    expect(parsed.rows[0].raw.destinatario).toContain("FERNANDA BUENO MANSANO");
    expect(parsed.rows[0].raw.documento_contraparte).toBe("467.250.167-15");
  });

  it("uses the negative sign as authoritative and retains own-account transfer details", () => {
    const parsed = parseCoraStatementText(header + "\n" + [
      "11/09/2026",
      "Transf Pix enviada",
      "FERNANDA BUENO",
      "086.567.007-23",
      "- R$ 1.000,00",
    ].join("\n"));

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].value).toMatchObject({
      type: "expense", amount_cents: 100000, due_date: "2026-09-11",
      counterparty_name: "FERNANDA BUENO",
    });
    expect(parsed.rows[0].raw.remetente).toContain("FERNANDA BUENO MANSANO");
    expect(parsed.rows[0].raw.destinatario).toBe("FERNANDA BUENO");
    expect(parsed.rows[0].raw.transferencia_propria).toBe("true");
  });

  it("does not treat a daily balance as a transaction amount", () => {
    const parsed = parseCoraStatementText(header + "\n15/09/2026\nSaldo do dia R$ 584,15");
    expect(parsed.rows).toHaveLength(0);
  });

  it("parses payments and preserves the institution as the beneficiary when explicit", () => {
    const parsed = parseCoraStatementText(header + "\n" + [
      "15/09/2026",
      "Pagamento da fatura",
      "Cora SCFI",
      "37.880.206/0001-63",
      "- R$ 128,00",
    ].join("\n"));
    expect(parsed.rows[0].value).toMatchObject({
      type: "expense", amount_cents: 12800, due_date: "2026-09-15",
      counterparty_name: "Cora SCFI",
    });
  });
});


describe("Cora statement metadata persistence contract", () => {
  const header = [
    "Cora SCFI - CNPJ 37.880.206/0001-63",
    "45.025.412 FERNANDA BUENO MANSANO (CNPJ 45.025.412/0001-14)",
  ].join("\n");

  it("parses QR-code payments as outgoing and retains document, original name and method without requiring email", () => {
    const parsed = parseCoraStatementText(header + "\n" + [
      "23/09/2026",
      "Pgto QR Code Pix",
      "CINTIA CRISTINA B...",
      "023.779.447-01",
      "- R$ 94,00",
    ].join("\n"));
    const value = parsed.rows[0].value;
    expect(value).toMatchObject({
      type: "expense", amount_cents: 9400, counterparty_name: "CINTIA CRISTINA B",
      counterparty_document: "023.779.447-01",
      counterparty_original_name: "CINTIA CRISTINA B...",
      payment_method: "PIX", is_own_transfer: false,
      counterparty_email: "",
    });
    expect(value?.sender_name).toContain("FERNANDA BUENO MANSANO");
    expect(value?.recipient_name).toBe("CINTIA CRISTINA B");
  });

  it("parses received payments and extracts a name when name and document share a line", () => {
    const parsed = parseCoraStatementText(header + "\n" + [
      "15/09/2026",
      "Pagamento recebido",
      "Alberto Correa / 30.720.110/0001-99",
      "+ R$ 300,00",
    ].join("\n"));
    expect(parsed.rows[0].value).toMatchObject({
      type: "income", amount_cents: 30000, counterparty_name: "Alberto Correa",
      counterparty_document: "30.720.110/0001-99", payment_method: "Boleto / pagamento",
      sender_name: "Alberto Correa",
    });
  });

  it("does not infer direction from the operation label when the signed amount disagrees", () => {
    const parsed = parseCoraStatementText(header + "\n" + [
      "15/09/2026",
      "Pagamento recebido",
      "ALBERTO CORREA",
      "30.720.110/0001-99",
      "- R$ 300,00",
    ].join("\n"));
    expect(parsed.rows[0].value?.type).toBe("expense");
    expect(parsed.rows[0].raw.tipo).toBe("saida");
  });

  it("rejects a transaction whose required counterparty is missing", () => {
    const parsed = parseCoraStatementText(header + "\n" + [
      "15/09/2026",
      "Transf Pix recebida",
      "+ R$ 50,00",
    ].join("\n"));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].value).toBeUndefined();
    expect(parsed.rows[0].errors.join(" ")).toContain("Pagador não identificado");
  });
});
