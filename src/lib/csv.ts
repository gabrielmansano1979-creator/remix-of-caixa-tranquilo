export interface CsvRow {
  line: number;
  raw: Record<string, string>;
  errors: string[];
  value?: { type: "income" | "expense"; description: string; amount_cents: number; due_date: string; counterparty_name: string; counterparty_email: string; counterparty_whatsapp: string; sender_name?: string; recipient_name?: string; counterparty_document?: string; counterparty_original_name?: string; payment_method?: string; is_own_transfer?: boolean; is_non_operating?: boolean };
}

export const CSV_TEMPLATE =
  "descricao,valor,vencimento,tipo,nome,email,whatsapp\n" +
  'Consultoria março,"1.500,00",15/10/2026,entrada,Maria Silva,maria@exemplo.com,(11) 98765-4321\n' +
  "Aluguel escritório,1200,2026-10-10,saida,Imobiliária Centro,,\n";

function splitLine(line: string, sep: string) {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === sep && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseMoney(s: string): number | null {
  let t = s.replace(/[R$\s]/g, "").replace(/[()]/g, "");
  if (!t) return null;
  // Accept Brazilian (1.234,56) and international (1,234.56) notation.
  if (/^[-+]?\d{1,3}(,\d{3})+\.\d{2}$/.test(t)) t = t.replace(/,/g, "");
  else if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export function parseDate(s: string): string | null {
  const input = s.trim().replace(/^["']|["']$/g, "");
  const monthNames: Record<string, string> = { jan: "01", janeiro: "01", feb: "02", fev: "02", fevereiro: "02", mar: "03", marco: "03", abril: "04", abr: "04", may: "05", mai: "05", maio: "05", jun: "06", junho: "06", jul: "07", julho: "07", aug: "08", ago: "08", agosto: "08", sep: "09", set: "09", setembro: "09", oct: "10", out: "10", outubro: "10", nov: "11", novembro: "11", dec: "12", dez: "12", dezembro: "12" };
  const namedMonth = input.match(/^(\d{1,2})\s+([A-Za-zÀ-ÿ]+),?\s+(\d{4})$/i);
  if (namedMonth) {
    const monthKey = namedMonth[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const month = monthNames[namedMonth[2].toLowerCase()] ?? monthNames[monthKey];
    if (month) return parseDate(namedMonth[1].padStart(2, "0") + "/" + month + "/" + namedMonth[3]);
  }
  let m = input.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})(?:\s+.*)?$/);
  let iso: string | null = null;
  // Extratos brasileiros normalmente usam DD/MM/AAAA; não inverter datas ambíguas automaticamente.
  if (m) iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = input.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  if (!iso) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day, 12));
  return Number.isNaN(d.getTime()) || d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day ? null : iso;
}

import { toE164 } from "./phone";
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCsv(text: string): { rows: CsvRow[]; headerError?: string } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows: [], headerError: "Arquivo vazio." };
  const sep = lines[0].split(";").length > lines[0].split(",").length ? ";" : ",";
  const head = splitLine(lines[0], sep).map((h) => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const need = ["descricao", "valor", "vencimento", "tipo", "nome"];
  const missing = need.filter((n) => !head.includes(n));
  if (missing.length) return { rows: [], headerError: `Colunas ausentes: ${missing.join(", ")}.` };
  const rows = lines.slice(1).map((l, i) => {
    const cells = splitLine(l, sep);
    const raw = Object.fromEntries(head.map((h, j) => [h, cells[j] ?? ""]));
    const errors: string[] = [];
    const description = raw.descricao.slice(0, 200);
    if (!description) errors.push("Descrição vazia");
    const amount = parseMoney(raw.valor);
    if (amount === null) errors.push("Valor inválido");
    const date = parseDate(raw.vencimento);
    if (!date) errors.push("Data inválida");
    const tipo = raw.tipo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const type = tipo === "entrada" ? "income" : tipo === "saida" ? "expense" : null;
    if (!type) errors.push("Tipo deve ser entrada ou saida");
    if (type && !raw.nome.trim()) errors.push(type === "income" ? "Informe quem pagou à empresa (coluna nome)." : "Informe quem recebeu o pagamento (coluna nome).");
    const email = (raw.email ?? "").toLowerCase();
    const wa = toE164(raw.whatsapp ?? "");
    if (raw.whatsapp && !wa) errors.push("WhatsApp inválido");
    if (email && !EMAIL.test(email)) errors.push("E-mail inválido");
    const row: CsvRow = { line: i + 2, raw, errors };
    if (!errors.length && type && amount !== null && date) row.value = { type, description, amount_cents: amount, due_date: date, counterparty_name: raw.nome.slice(0, 120), counterparty_email: email, counterparty_whatsapp: wa ?? "" };
    return row;
  });
  return { rows };
}

function normalizeStatementDate(raw: string): string | null {
  return parseDate(raw.trim());
}

function extractTransferParties(transactionText: string): { sender: string; recipient: string } {
  const text = transactionText.replace(/\s+/g, " ").trim();
  const pairPatterns = [
    /\b(?:transfer[eê]ncia|transfer|pix)\s+de\s+(.+?)\s+para\s+(.+)$/i,
    /\b(?:from|remetente)\s*[:=-]\s*(.+?)\s+\b(?:to|destinat[aá]rio)\s*[:=-]\s*(.+)$/i,
    /\b(?:origem)\s*[:=-]\s*(.+?)\s+\b(?:destino)\s*[:=-]\s*(.+)$/i,
  ];
  for (const pattern of pairPatterns) {
    const match = text.match(pattern);
    if (match) return {
      sender: match[1].replace(/[.;,]+$/, "").trim().slice(0, 120),
      recipient: match[2].replace(/[.;,]+$/, "").trim().slice(0, 120),
    };
  }
  return { sender: "", recipient: "" };
}

function extractCounterparty(transactionText: string, type: "income" | "expense" | null): string {
  const text = transactionText.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const patterns = type === "income"
    ? [
        /\b(?:pix|ted|doc|transfer[eê]ncia|transfer)\s+(?:recebido|recebida|recebimento)\s+(?:de|do|da|dos|das)\s+(.+)$/i,
        /\b(?:received|credited|incoming transfer|deposit)\s+(?:from|by|of)\s+(.+)$/i,
        /\b(?:from|payer|sender)\s*[:=-]\s*(.+)$/i,
        /\b(?:recebido|recebida|creditado|creditada)\s+(?:de|do|da|dos|das)\s+(.+)$/i,
        /\b(?:remetente|pagador|ordenante|origem)\s*[:=-]\s*(.+)$/i,
      ]
    : [
        /\b(?:pix|ted|doc|transfer[eê]ncia|transfer)\s+(?:enviado|enviada|feito)\s+(?:para|a|ao|à|pro|pra)\s+(.+)$/i,
        /\b(?:sent|paid|payment|purchase|withdrawal)\s+(?:to|for|at|from)\s+(.+)$/i,
        /\b(?:to|recipient|beneficiary|payee)\s*[:=-]\s*(.+)$/i,
        /\b(?:enviado|enviada|transferido|transferida|pago|paga)\s+(?:para|a|ao|pro|pra)\s+(.+)$/i,
        /\b(?:pagamento|boleto|conta|compra)\s+(?:de|do|da|dos|das|para|ao|a)\s+(.+)$/i,
        /\b(?:destinat[aá]rio|favorecido|benefici[aá]rio|recebedor)\s*[:=-]\s*(.+)$/i,
      ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/[.;,]+$/, "").trim().slice(0, 120);
  }
  const explicit = text.match(/\b(?:de|para|favorecido|benefici[aá]rio|remetente|destinat[aá]rio)\s*[:=-]?\s+([A-ZÀ-Ý][A-ZÀ-Ýa-zà-ÿ.' -]{2,100})$/);
  return explicit?.[1]?.trim().slice(0, 120) ?? "";
}

function statementAmountMatch(line: string): RegExpMatchArray | null {
  // Prefer a complete monetary token at the end of the row, optionally followed by bank debit/credit markers.
  const pattern = /(?:R\$\s*)?([+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?|[+-]?\d{1,3}(?:,\d{3})+\.\d{2})\s*(CR|C|DB|D)?\s*$/i;
  return line.match(pattern);
}

export function parseStatementText(text: string): { rows: CsvRow[]; ignored: number } {
  const lines = text
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const datePattern = /(?:^|\s)(\d{2}[/. -]\d{2}[/. -]\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+[A-Za-zÀ-ÿ]{3,},?\s+\d{4})(?=\s|$)/i;
  const rows: CsvRow[] = [];
  let ignored = 0;

  for (const [index, line] of lines.entries()) {
    const dateMatch = line.match(datePattern);
    const amountMatch = statementAmountMatch(line);
    if (!dateMatch || !amountMatch) {
      // Ignore headings and balances, but report lines that look transaction-like and could not be parsed.
      if (/\b(pix|ted|doc|transfer|compra|pagamento|pagto|saque|dep[oó]sito|tarifa|boleto|recebimento|cr[eé]dito|d[eé]bito)\b/i.test(line)) ignored++;
      continue;
    }

    const date = normalizeStatementDate(dateMatch[1]);
    const amountToken = amountMatch[1].replace(/^[+-]/, "");
    const cents = parseMoney(amountToken);
    if (!date || cents === null) {
      ignored++;
      continue;
    }

    const direction = amountMatch[2]?.toUpperCase();
    const negative = amountMatch[1].startsWith("-");
    const transactionText = line
      .replace(dateMatch[0], " ")
      .replace(amountMatch[0], " ")
      .replace(/\s+/g, " ")
      .trim();
    const normalizedText = transactionText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const type = negative || direction === "D" || direction === "DB" ||
      /\b(pagamento|pagto|debito|compra|saida|saque|retirada|tarifa|boleto pago|pix enviado|transferencia enviada)\b/.test(normalizedText)
      ? "expense"
      : direction === "C" || direction === "CR" || amountMatch[1].startsWith("+") ||
        /\b(receb|credito|deposito|entrada|estorno|salario|pix recebido|transferencia recebida)\w*/.test(normalizedText)
        ? "income"
        : null;

    const errors = type ? [] : ["Não foi possível identificar se o lançamento é entrada ou saída; confira e classifique manualmente."];
    const description = transactionText.slice(0, 200);
    const parties = extractTransferParties(transactionText);
    const inferredCounterparty = extractCounterparty(transactionText, type);
    const counterparty = type === "income"
      ? parties.sender || inferredCounterparty
      : type === "expense"
        ? parties.recipient || inferredCounterparty
        : inferredCounterparty;
    if (!parties.sender && type === "income") parties.sender = counterparty;
    if (!parties.recipient && type === "expense") parties.recipient = counterparty;
    if (!description) errors.push("Descrição não identificada no documento.");
    if (type && !counterparty.trim()) errors.push(type === "income" ? "Pagador não identificado; informe quem pagou à empresa antes de importar." : "Beneficiário não identificado; informe quem recebeu o pagamento antes de importar.");

    const row: CsvRow = {
      line: index + 1,
      raw: { descricao: description, valor: amountToken, vencimento: dateMatch[1], tipo: type === "income" ? "entrada" : type === "expense" ? "saida" : "não identificado", nome: counterparty, remetente: parties.sender, destinatario: parties.recipient },
      errors,
    };
    if (!errors.length && type) {
      row.value = {
        type,
        description,
        amount_cents: cents,
        due_date: date,
        counterparty_name: counterparty,
        counterparty_email: "",
        counterparty_whatsapp: "",
      };
    }
    rows.push(row);
  }
  return { rows, ignored };
}

/** Parse bank-exported OFX/QFX files without relying on a specific bank's tag ordering. */
export function parseOfxText(text: string): { rows: CsvRow[]; ignored: number } {
  const rows: CsvRow[] = [];
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  let ignored = 0;

  const tag = (block: string, name: string) => {
    const match = block.match(new RegExp(`<${name}>([^\r\n<]*)`, "i"));
    return match?.[1]?.trim().replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">") ?? "";
  };

  for (const [index, block] of blocks.entries()) {
    const posted = tag(block, "DTPOSTED").slice(0, 8);
    const date = /^\d{8}$/.test(posted)
      ? parseDate(`${posted.slice(0, 4)}-${posted.slice(4, 6)}-${posted.slice(6, 8)}`)
      : null;
    const amountRaw = tag(block, "TRNAMT").replace(/,/g, "");
    const amountNumber = Number(amountRaw);
    const amountCents = Number.isFinite(amountNumber) && amountNumber !== 0
      ? Math.round(Math.abs(amountNumber) * 100)
      : null;
    const name = tag(block, "NAME").slice(0, 120);
    const memo = tag(block, "MEMO");
    const description = [name, memo].filter(Boolean).join(" — ").slice(0, 200);
    if (!date || amountCents === null || !description) {
      ignored++;
      continue;
    }

    const type = amountNumber < 0 ? "expense" : "income";
    const normalizedName = name.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().trim();
    const genericName = /^(pix|ted|doc|transfer|transferencia|pagamento|compra|debito|credito|recebimento|saque|tarifa)(\\s+(recebido|recebida|enviado|enviada|cartao|debito|credito))?$/.test(normalizedName);
    // OFX NAME commonly contains the merchant/person even when MEMO contains only the operation type.
    // Use NAME as a fallback only when it looks like an actual party, not a generic transaction label.
    const counterparty = extractCounterparty(description, type) || (name && !genericName ? name : "");
    const errors = counterparty ? [] : [type === "income"
      ? "Pagador não identificado no OFX; informe quem pagou à empresa antes de importar."
      : "Beneficiário não identificado no OFX; informe quem recebeu o pagamento antes de importar."];
    const row: CsvRow = {
      line: index + 1,
      raw: {
        descricao: description,
        valor: String(Math.abs(amountNumber)),
        vencimento: date,
        tipo: type === "income" ? "entrada" : "saida",
        nome: counterparty,
      },
      errors,
    };
    if (counterparty) row.value = {
      type,
      description,
      amount_cents: amountCents,
      due_date: date,
      counterparty_name: counterparty,
      counterparty_email: "",
      counterparty_whatsapp: "",
    };
    rows.push(row);
  }
  return { rows, ignored };
}

/** Fallback for bank CSV/TXT tables whose column names differ from the app's template. */
export function parseBankTable(text: string): { rows: CsvRow[]; headerError?: string; ignored: number } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { rows: [], headerError: "A tabela não contém cabeçalho e lançamentos.", ignored: 0 };
  const first = lines[0];
  const candidates = [",", ";", "\t", "|"];
  const separator = candidates.sort((a, b) => splitLine(lines[0], b).length - splitLine(lines[0], a).length)[0];
  const header = splitLine(first, separator).map((cell) =>
    cell.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.,()/:#]+/g, " ").replace(/r\$/g, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
  );
  const dateIndex = header.findIndex((h) => /^(data|date|data lancamento|data movimento|dt lancamento|dt movimento|posting date|transaction date|data transacao|data da transacao|data efetiva|data operacao|data valor|data contabil|data contabilizacao|data de lancamento|data do lancamento|data do movimento|data hora|transaction posting date|value date|booking date|effective date)$/.test(h));
  const descriptionIndex = header.findIndex((h) => /^(descricao|historico|historico descricao|descricao historico|lancamento|lancamentos|detalhe|detalhes|memo|description|transaction description|transaction details|details|narrative|particulars|payee|beneficiario|estabelecimento|transacao|transaction|operacao|identificacao|complemento|documento|tipo lancamento|historico do lancamento|descricao do lancamento|historico da transacao|descricao da transacao|historico movimento|descricao movimento|historico da movimentacao|descricao da movimentacao|detalhes da transacao)$/.test(h));
  const amountIndex = header.findIndex((h) => /^(valor|amount|quantia|montante|valor r\$|amount brl|total|valor lancamento|valor movimento|valor da transacao|valor transacao|valor da movimentacao|valor movimentacao|valor do lancamento|valor lancamento|vl lancamento|vl movimento|transaction amount|amount of transaction|movement amount|valor da operacao|valor operacao|importe)$/.test(h));
  const debitIndex = header.findIndex((h) => /^(debito|debitos|debit|debits|saidas|saida|withdrawal|withdrawals|debit amount|valor debito|vl debito|debito r\$|saidas r\$|valor saida|valor de saida|valor de debito|valor dos debitos|retirada|retiradas|pagamento)$/.test(h));
  const creditIndex = header.findIndex((h) => /^(credito|creditos|credit|credits|entradas|entrada|deposit|deposits|deposito|credit amount|valor credito|vl credito|credito r\$|entradas r\$|valor entrada|valor de entrada|valor de credito|valor dos creditos|recebimento|depositos)$/.test(h));
  const typeIndex = header.findIndex((h) => /^(tipo|type|natureza|operacao|operation|direcao|tipo de transacao|tipo transacao|tipo de lancamento)$/.test(h));
  const senderIndex = header.findIndex((h) => /^(remetente|pagador|nome pagador|nome do pagador|ordenante|origem|sender|payer|from|sender name|payer name)$/.test(h));
  const recipientIndex = header.findIndex((h) => /^(destinatario|nome destinatario|nome do destinatario|favorecido|nome favorecido|beneficiario|nome beneficiario|recebedor|payee|recipient|recipient name|beneficiary|to)$/.test(h));
  const counterpartyIndex = header.findIndex((h) => /^(nome|razao social|contraparte|counterparty|nome contraparte|nome favorecido|nome remetente|nome cliente|nome contraparte financeira|nome da contraparte|counterparty name|counterparty)$/.test(h));
  const documentIndex = header.findIndex((h) => /^(cpf|cnpj|cpf cnpj|cnpj cpf|documento contraparte|documento do favorecido|documento beneficiario|documento remetente|tax id|counterparty document)$/.test(h));
  if (dateIndex < 0 || descriptionIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) {
    return { rows: [], headerError: "Não reconheci as colunas. Preciso identificar data, descrição e valor (ou débito/crédito).", ignored: 0 };
  }

  const rows: CsvRow[] = [];
  let ignored = 0;
  for (const [index, line] of lines.slice(1).entries()) {
    const cells = splitLine(line, separator);
    const rawDate = cells[dateIndex] ?? "";
    const date = normalizeStatementDate(rawDate);
    const description = ((typeIndex >= 0 && header[descriptionIndex] === "detalhe" && (cells[typeIndex] ?? "").trim()) ? `${(cells[typeIndex] ?? "").trim()} — ${(cells[descriptionIndex] ?? "").trim()}` : (cells[descriptionIndex] ?? "")).slice(0, 200);
    const normalizedDescription = description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    if (/^(saldo (do dia|anterior|inicial|final|disponivel)|total de (entradas|saidas|creditos|debitos))\b/.test(normalizedDescription)) continue;
    const debitRaw = debitIndex >= 0 ? cells[debitIndex] ?? "" : "";
    const creditRaw = creditIndex >= 0 ? cells[creditIndex] ?? "" : "";
    const amountRaw = amountIndex >= 0 ? cells[amountIndex] ?? "" : "";
    const debit = parseMoney(debitRaw.replace(/^[+-]/, ""));
    const credit = parseMoney(creditRaw.replace(/^[+-]/, ""));
    const signedNegative = /^\s*-/.test(amountRaw) || /^\s*\(.*\)\s*$/.test(amountRaw);
    const signedPositive = /^\s*\+/.test(amountRaw);
    const amount = amountIndex >= 0 ? parseMoney(amountRaw.replace(/^[+-]/, "").replace(/[()]/g, "")) : null;
    const chosenAmount = debit !== null ? debit : credit !== null ? credit : amount;
    if (!date || !description || chosenAmount === null) {
      ignored++;
      continue;
    }
    const rawType = typeIndex >= 0 ? (cells[typeIndex] ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
    const directionText = (rawType + " " + description).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const type = debit !== null ? "expense"
      : credit !== null ? "income"
      : /\b(vendas|venda|sales|sale)\b/.test(rawType) && !signedNegative ? "income"
      : signedNegative || /\b(debito|saida|despesa|pagamento|pagto|compra|withdrawal|withdrawals|expense|saque|retirada|tarifa|boleto pago|pix enviado|transferencia enviada|paid|payment|purchase|outgoing|sent|transfer out|debit card|bill payment|amortizacao|amortizacao de emprestimo)\b/.test(directionText) ? "expense"
      : signedPositive || /\b(credito|entrada|receita|deposito|recebimento|income|pix recebido|transferencia recebida|estorno|salario|received|credited|incoming|refund|transfer in|credit transfer|vendas|venda|sales|sale|liquidacao de vendas|resgate(?: total| parcial)? de? cdb)\b/.test(directionText) ? "income"
      : null;
    const errors = type ? [] : ["A linha foi lida, mas o arquivo não informa se o valor é entrada ou saída; classifique manualmente."];
    const explicitSender = senderIndex >= 0 ? (cells[senderIndex] ?? "").trim().slice(0, 120) : "";
    const explicitRecipient = recipientIndex >= 0 ? (cells[recipientIndex] ?? "").trim().slice(0, 120) : "";
    const namedCounterparty = counterpartyIndex >= 0 ? (cells[counterpartyIndex] ?? "").trim().slice(0, 120) : "";
    const parties = extractTransferParties(description);
    const sender = explicitSender || (type === "income" ? namedCounterparty : "") || parties.sender || (type === "income" ? extractCounterparty(description, type) : "");
    const recipient = explicitRecipient || (type === "expense" ? namedCounterparty : "") || parties.recipient || (type === "expense" ? extractCounterparty(description, type) : "");
    const isInvestmentMovement = /\b(renda fixa|aplicacao(?: em)? cdb|resgate(?: total| parcial)? de? cdb|cdb.*(?:aplicacao|resgate)|(?:aplicacao|resgate).*cdb)\b/.test(normalizedDescription);
    const isNonOperatingMovement = /\b(emprestimo inteligente|loan repayment|loan amortization|principal repayment|amortizacao de emprestimo)\b/.test(directionText) && !isInvestmentMovement;
    const isCardSales = /\b(vendas|venda|sales|sale)\b/.test(rawType);
    const explicitCounterparty = type === "income"
      ? (sender || (counterpartyIndex >= 0 ? cells[counterpartyIndex] ?? "" : ""))
      : type === "expense"
        ? (recipient || (counterpartyIndex >= 0 ? cells[counterpartyIndex] ?? "" : ""))
        : (counterpartyIndex >= 0 ? cells[counterpartyIndex] ?? "" : "");
    const isPixMovement = /\bpix\s+(enviado|enviada|recebido|recebida)\b/i.test(rawType);
    const pixDescriptionParty = isPixMovement && !/^(pix\s+(enviado|enviada|recebido|recebida)|disponivel\s+(debito|credito)\s+\w+)$/i.test(description.trim())
      ? description.replace(/^pix\s+(?:enviado|enviada|recebido|recebida)\s+(?:de|do|da|para|pro|pra)?\s*/i, "").trim()
      : "";
    const counterparty = (explicitCounterparty.trim() || (isInvestmentMovement
      ? (/resgate/i.test(description) ? "Resgate próprio de CDB" : "Aplicação própria em CDB")
      : isCardSales ? "Liquidação de vendas por cartão"
      : pixDescriptionParty)).slice(0, 120);
    const counterpartyDocument = documentIndex >= 0 ? (cells[documentIndex] ?? "").trim().slice(0, 32) : "";
    const paymentMethod = isInvestmentMovement ? (/resgate/i.test(description) ? "Resgate de CDB" : "Aplicação em CDB")
      : /pix/i.test(directionText) ? "PIX"
      : /boleto/i.test(directionText) ? "Boleto"
      : isCardSales ? "Venda / liquidação de cartão" : "";
    if (type && !counterparty) errors.push(type === "income" ? "Informe quem pagou à empresa antes de importar." : "Informe quem recebeu o pagamento antes de importar.");
    const row: CsvRow = {
      line: index + 2,
      raw: {
        descricao: description,
        valor: String(chosenAmount / 100),
        vencimento: rawDate,
        tipo: type === "income" ? "entrada" : type === "expense" ? "saida" : "não identificado",
        nome: counterparty,
        remetente: sender,
        destinatario: recipient,
        metodo: paymentMethod,
        documento_contraparte: counterpartyDocument,
        transferencia_propria: String(isInvestmentMovement),
        nao_operacional: String(isNonOperatingMovement),
      },
      errors,
    };
    if (type && counterparty && !errors.length) row.value = {
      type, description, amount_cents: chosenAmount, due_date: date,
      counterparty_name: counterparty, counterparty_email: "", counterparty_whatsapp: "",
      counterparty_document: counterpartyDocument || undefined,
      sender_name: type === "income" ? counterparty : undefined,
      recipient_name: type === "expense" ? counterparty : undefined,
      payment_method: paymentMethod || undefined,
      is_own_transfer: isInvestmentMovement,
      is_non_operating: isNonOperatingMovement,
    };
    rows.push(row);
  }
  return { rows, ignored };
}


/**
 * General-purpose PDF statement parser with multiple extraction strategies:
 * table headers first, then single-line rows, then multi-line transaction blocks.
 * Ambiguous rows remain visible for manual review instead of being guessed.
 */
export function parsePdfStatementText(text: string): { rows: CsvRow[]; ignored: number; headerError?: string } {
  const lines = text.replace(/[\u00a0\u2007\u202f]/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/g, ""))
    .filter((line) => line.trim());

  const splitPdfColumns = (line: string): string[] => {
    const trimmed = line.trim();
    if (trimmed.includes("\t")) return trimmed.split("\t").map((cell) => cell.trim());
    return trimmed.split(/ {2,}/).map((cell) => cell.trim());
  };
  const normalize = (cell: string) => cell.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,()/:#]+/g, " ").replace(/r\$/g, "")
    .replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const isDateHeader = (cell: string) =>
    /^(data|date|data lancamento|data do lancamento|data movimento|data do movimento|dt lancamento|dt movimento|posting date|transaction date|transaction posting date|data transacao|data da transacao|data efetiva|data operacao|data contabil|data contabilizacao|data valor|data hora|dia|data de movimento|data da operacao|data do evento|value date|booking date|effective date)$/.test(cell);
  const isDescriptionHeader = (cell: string) =>
    /^(descricao|historico|historico descricao|descricao historico|lancamento|lancamentos|detalhe|detalhes|memo|description|transaction description|transaction details|details|narrative|particulars|payee|beneficiario|estabelecimento|transacao|transaction|operacao|identificacao|complemento|documento|saldo historico|historico da transacao|descricao da transacao|historico da movimentacao|descricao da movimentacao|historico movimento|descricao movimento|detalhes da transacao|movimentacao|movimento|origem destino)$/.test(cell);
  const isAmountHeader = (cell: string) =>
    /^(valor|amount|quantia|montante|total|debito|debit|credito|credit|entradas|saidas|deposito|retirada|valor debito|valor credito|vl debito|vl credito|valor da transacao|valor transacao|valor movimentacao|valor movimento|valor lancamento|valor da movimentacao|valor do lancamento|valor entrada|valor saida|debitos|creditos|withdrawal|withdrawals|deposit|deposits|entrada|saida|valor r\$|valor da operacao|valor operacao|importe|creditos r\$|debitos r\$|valor credito r\$|valor debito r\$|transaction amount|amount of transaction|movement amount|debits|credits)$/.test(cell);
  const isBalanceHeader = (cell: string) =>
    /^(saldo|balance|saldo final|saldo inicial|running balance|saldo disponivel|saldo do dia|saldo atual|saldo anterior|available balance|closing balance|opening balance|saldo apos movimento|saldo apos lancamento|saldo contabil|available balance|closing balance|opening balance|current balance)$/.test(cell);

  // Strategy 1: use a detected header to map the actual columns.
  for (let i = 0; i < Math.min(lines.length, 160); i++) {
    const cells = splitPdfColumns(lines[i]).map(normalize);
    const hasDate = cells.some(isDateHeader);
    const hasDescription = cells.some(isDescriptionHeader);
    const hasAmount = cells.some(isAmountHeader);
    const hasBalance = cells.some(isBalanceHeader);
    if (!hasDate || !hasDescription || (!hasAmount && !hasBalance)) continue;

    const normalizedTable = lines.slice(i).map((line) => splitPdfColumns(line).join("\t")).join("\n");
    const table = parseBankTable(normalizedTable);
    if (table.rows.length) return table;
    if (hasBalance && !hasAmount) {
      return {
        rows: [],
        ignored: table.ignored,
        headerError: "Identifiquei o saldo do extrato, mas não encontrei uma coluna confiável para o valor de cada movimentação. Nenhum lançamento foi importado.",
      };
    }
  }

  // Strategy 2: dated single-line transactions.
  const fallback = parseStatementText(text);
  // A date-only line can be misread as a monetary amount because the year ends
  // in digits. Keep only actual transaction rows with a non-empty description.
  const singleLineRows = fallback.rows.filter((row) => Boolean(row.raw.descricao?.trim()));
  if (singleLineRows.length) return { ...fallback, rows: singleLineRows };

  // Strategy 3: multi-line transactions, where date, operation, counterparty and
  // signed amount may each be on a separate line.
  const dateToken = /(?:^|\s)(\d{2}[/. -]\d{2}[/. -]\d{4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}\s+[A-Za-zÀ-ÿ]{3,},?\s+\d{4})(?=\s|$)/i;
  const signedAmountLine = /^\s*([+-])\s*(?:R\$\s*)?((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}|(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})\s*(?:CR|DB|C|D)?\s*$/i;
  const amountAtEnd = /(?:R\$\s*)?([+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?|[+-]?\d{1,3}(?:,\d{3})+\.\d{2})\s*(CR|C|DB|D)?\s*$/i;
  const noise = /^(?:extrato(?: bancario| de conta| da conta)?|saldo (?:inicial|final|anterior|disponivel|do dia)|total de (?:entradas|saidas|creditos|debitos)|periodo:|pagina \d|pag\.?\s*\d|ouvidoria|agencia|conta:|cnpj:|cpf:)/i;
  const transactionHint = /\b(pix|ted|doc|transfer|transf|compra|pagamento|pagto|saque|deposito|tarifa|boleto|recebimento|credito|debito|estorno|salario|cartao|fatura|rendimentos|resgate|aplicacao|liquidacao|received|payment|purchase|withdrawal|deposit|refund|credit|debit|salary|incoming|outgoing)\b/i;
  type Block = { date: string; parts: string[]; line: number };
  const blocks: Block[] = [];
  let current: Block | null = null;
  const flushBlock = () => {
    if (current && current.parts.length) blocks.push(current);
    current = null;
  };
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    const dateMatch = line.match(dateToken);
    if (dateMatch) {
      flushBlock();
      const date = normalizeStatementDate(dateMatch[1]);
      const afterDate = line.slice((dateMatch.index ?? 0) + dateMatch[0].length).trim();
      if (date) {
        current = { date, parts: [], line: index + 1 };
        if (afterDate) current.parts.push(afterDate);
      }
      continue;
    }
    if (current && !noise.test(line)) current.parts.push(line);
  }
  flushBlock();

  const rows: CsvRow[] = [];
  let ignored = 0;
  for (const block of blocks) {
    const parts = block.parts.filter((part) => part && !noise.test(part));
    if (!parts.length) continue;
    let sign: string | null = null;
    let amountToken = "";
    let amountPartIndex = -1;

    for (let i = parts.length - 1; i >= 0; i--) {
      const match = parts[i].match(signedAmountLine);
      if (match) {
        sign = match[1];
        amountToken = match[2];
        amountPartIndex = i;
        break;
      }
    }
    if (amountPartIndex < 0) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const match = parts[i].match(amountAtEnd);
        if (!match) continue;
        const moneyTokens = parts[i].match(/(?:R\$\s*)?[-+]?\d[\d.,]*\d|\b\d+[,.]\d{2}\b/g) ?? [];
        // A line with multiple monetary values may contain both amount and balance;
        // without column coordinates, do not guess which value is the transaction.
        if (moneyTokens.length > 1) continue;
        amountToken = match[1].replace(/^[+-]/, "");
        if (match[1].startsWith("-") || /^(?:D|DB)$/i.test(match[2] ?? "")) sign = "-";
        else if (match[1].startsWith("+") || /^(?:C|CR)$/i.test(match[2] ?? "")) sign = "+";
        amountPartIndex = i;
        break;
      }
    }
    if (amountPartIndex < 0 || !amountToken) {
      ignored++;
      continue;
    }
    const description = parts.filter((_, index) => index !== amountPartIndex)
      .join(" — ").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!description || !transactionHint.test(description)) {
      ignored++;
      continue;
    }
    const normalizedDescription = description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const type = sign === "+" ? "income" : sign === "-" ? "expense"
      : /\b(pagamento|pagto|debito|compra|saida|saque|retirada|tarifa|boleto pago|pix enviado|transferencia enviada|transferencia realizada|enviado para|enviada para)\b/.test(normalizedDescription) ? "expense"
      : /\b(receb|credito|deposito|entrada|estorno|salario|pix recebido|transferencia recebida|recebido de|recebida de|rendimento)\w*/.test(normalizedDescription) ? "income"
      : null;
    const parties = extractTransferParties(description);
    const inferredCounterparty = extractCounterparty(description, type);
    const partyLine = parts
      .filter((part, index) => index !== amountPartIndex)
      .find((part) => !transactionHint.test(part) && !/\b(?:CPF|CNPJ)\b/i.test(part) &&
        !/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2}/.test(part) &&
        /[A-Za-zÀ-ÿ]{3}/.test(part));
    const cleanedPartyLine = partyLine?.replace(/\b(?:CPF|CNPJ)\b\s*[:.]?/ig, "")
      .replace(/\b(?:\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})\b/g, "")
      .replace(/[|/—–-]+/g, " ").trim().slice(0, 120) ?? "";
    const counterparty = type === "income" ? parties.sender || inferredCounterparty || cleanedPartyLine
      : type === "expense" ? parties.recipient || inferredCounterparty || cleanedPartyLine : inferredCounterparty || cleanedPartyLine;
    const errors: string[] = [];
    if (!type) errors.push("Não foi possível identificar se o lançamento é entrada ou saída; confira e classifique manualmente.");
    if (!counterparty) errors.push(type === "income"
      ? "Pagador não identificado; informe quem pagou à empresa antes de importar."
      : type === "expense"
        ? "Beneficiário não identificado; informe quem recebeu o pagamento antes de importar."
        : "Contraparte não identificada; confira o lançamento antes de importar.");
    const cents = parseMoney(amountToken);
    if (cents === null) errors.push("Valor inválido no extrato.");
    const row: CsvRow = {
      line: block.line,
      raw: {
        descricao: description,
        valor: (sign ?? "") + amountToken,
        vencimento: block.date,
        tipo: type === "income" ? "entrada" : type === "expense" ? "saida" : "não identificado",
        nome: counterparty,
        remetente: type === "income" ? counterparty : parties.sender,
        destinatario: type === "expense" ? counterparty : parties.recipient,
      },
      errors,
    };
    if (!errors.length && type && cents !== null && counterparty) {
      row.value = {
        type, description, amount_cents: cents, due_date: block.date,
        counterparty_name: counterparty, counterparty_email: "", counterparty_whatsapp: "",
      };
    }
    rows.push(row);
  }
  if (rows.length) return { rows, ignored: ignored + fallback.ignored };
  return {
    rows: [],
    ignored: fallback.ignored + ignored,
    headerError: "Não consegui identificar lançamentos com segurança neste layout de PDF. O arquivo foi lido, mas o formato não correspondeu às estratégias de extração disponíveis. Nenhum lançamento foi importado; revise a legibilidade ou envie o PDF para ampliar o suporte a esse layout.",
  };
}

/** Parser for Cora PDFs, where each transaction is a multi-line block under a daily date heading. */
export function parseCoraStatementText(text: string): { rows: CsvRow[]; ignored: number } {
  const lines = text.replace(/[\u00a0\u2007\u202f]/g, " ").replace(/\r/g, "\n")
    .split(/\n+/).map((line) => line.replace(/[ \t]+/g, " ").trim()).filter(Boolean);
  const holderLine = lines.find((line) =>
    /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/.test(line) &&
    !/CORA|SCFI|OUVIDORIA/i.test(line) && !/Saldo do dia/i.test(line)
  );
  const holderName = (() => {
    if (!holderLine) return "Titular da conta";
    const withoutDocument = holderLine
      .replace(/\(?\s*CNPJ\s*[:.]?\s*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s*\)?/ig, "")
      .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, "")
      .replace(/^[\s:–-]+|[\s:–-]+$/g, "").replace(/^\d{2}\.\d{3}\.\d{3}\s+/, "").trim();
    return /[A-ZÀ-Ý]{3}/i.test(withoutDocument) && !/EXTRATO|SALDO/i.test(withoutDocument)
      ? withoutDocument.slice(0, 120) : "Titular da conta";
  })();
  const holderId = holderLine?.match(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/)?.[0] ?? "";
  const dateToken = /\b(\d{2}\/\d{2}\/\d{4})\b/;
  const amountToken = /([+-])\s*R\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})/i;
  const dailyBalance = /^\s*Saldo\s+do\s+dia\b/i;
  const noise = /^(?:Extrato do per[ií]odo|Saldo inicial dispon[ií]vel|Total de entradas|Total de sa[ií]das|Saldo final dispon[ií]vel|Ouvidoria:|Extrato gerado no dia|p[aá]g\.?\s*\d+\s+de\s+\d+|Cora SCFI\s*[-–]\s*CNPJ)/i;
  const operation = /(?:Pgto\s+QR\s+Code\s+Pix|Transf\s+Pix\s+(?:enviada|recebida)|Pagamento\s+(?:da\s+fatura|recebido)|Pix\s+(?:enviado|recebido)|Transfer[eê]ncia\s+(?:enviada|recebida))/i;
  type Pending = { date: string; operation: string; lines: string[]; startLine: number };
  const pendingState: { current: Pending | null } = { current: null };
  let currentDate = "";
  const rows: CsvRow[] = [];
  let ignored = 0;

  const flush = (signedAmount?: { sign: string; amount: string }, endLine = 0) => {
    if (!pendingState.current) return;
    if (!signedAmount) { ignored++; pendingState.current = null; return; }
    const cents = parseMoney(signedAmount.amount);
    const date = parseDate(pendingState.current.date);
    const detailLines = pendingState.current.lines.map((line) => line.trim())
      .filter((line) => line && !noise.test(line) && !dailyBalance.test(line));
    const docLine = detailLines.find((line) =>
      /\b(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/.test(line)
    ) ?? "";
    const document = docLine.match(/\b(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/)?.[0] ?? "";
    const originalCounterparty = detailLines.map((line) =>
      line.replace(/\b(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/g, "")
        .replace(/\b(?:CPF|CNPJ)\b\s*[:.]?/ig, "")
        .replace(/^[\s|/—–-]+/g, "")
        .replace(/[|/—–-]+\s*$/g, "").trim()
    ).find((line) => line && !/^(?:CPF|CNPJ)\b/i.test(line) &&
      !/^(?:Extrato gerado|P[aá]g\.?\s*\d)/i.test(line)
    ) ?? "";
    const counterparty = originalCounterparty.replace(/\s*(?:\.{2,}|…+)\s*$/u, "")
      .replace(/\s+/g, " ").trim().slice(0, 120);
    const type = signedAmount.sign === "+" ? "income" : "expense";
    const method = /pix|qr code/i.test(pendingState.current.operation) ? "PIX"
      : /fatura/i.test(pendingState.current.operation) ? "Pagamento de fatura"
      : /pagamento recebido/i.test(pendingState.current.operation) ? "Boleto / pagamento"
      : "Transferência / pagamento";
    const originalDescription = [pendingState.current.operation, ...detailLines].join(" — ").slice(0, 200);
    const normalizedHolder = holderName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const normalizedParty = counterparty.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const isOwnTransfer = Boolean(
      (holderId && document && holderId === document) ||
      (holderName !== "Titular da conta" && normalizedParty &&
       normalizedHolder.split(/\s+/).filter(Boolean).slice(0, 2).every((part) => normalizedParty.includes(part)))
    );
    const sender = type === "income" ? counterparty : holderName;
    const recipient = type === "income" ? holderName : counterparty;
    const errors: string[] = [];
    if (!date) errors.push("Data inválida no cabeçalho do dia.");
    if (cents === null) errors.push("Valor inválido no extrato.");
    if (!counterparty) errors.push(type === "income"
      ? "Pagador não identificado; informe quem pagou à empresa antes de importar."
      : "Beneficiário não identificado; informe quem recebeu o pagamento antes de importar.");
    const row: CsvRow = {
      line: pendingState.current.startLine || endLine,
      raw: {
        descricao: originalDescription,
        valor: signedAmount.sign + "R$ " + signedAmount.amount,
        vencimento: pendingState.current.date,
        tipo: type === "income" ? "entrada" : "saida",
        nome: counterparty,
        nome_original: originalCounterparty,
        documento_contraparte: document,
        metodo: method,
        remetente: sender,
        destinatario: recipient,
        transferencia_propria: isOwnTransfer ? "true" : "false",
        titular_conta: holderName,
      },
      errors,
    };
    if (!errors.length && date && cents !== null) row.value = {
      type, description: (pendingState.current.operation + (counterparty ? " — " + counterparty : "")).slice(0, 200),
      amount_cents: cents, due_date: date, counterparty_name: counterparty,
      counterparty_email: "", counterparty_whatsapp: "",
      sender_name: sender.slice(0, 120), recipient_name: recipient.slice(0, 120),
      counterparty_document: document.slice(0, 32),
      counterparty_original_name: originalCounterparty.slice(0, 120),
      payment_method: method.slice(0, 60),
      is_own_transfer: isOwnTransfer,
    };
    rows.push(row);
    pendingState.current = null;
  };

  const startOperation = (line: string, index: number) => {
    const match = line.match(operation);
    if (!match || match.index === undefined) return false;
    flush(undefined, index + 1);
    if (!currentDate) { ignored++; return true; }
    const operationName = match[0].replace(/\s+/g, " ").trim();
    const before = line.slice(0, match.index).trim();
    const after = line.slice(match.index + match[0].length).trim();
    pendingState.current = { date: currentDate, operation: operationName, lines: [before, after].filter(Boolean), startLine: index + 1 };
    return true;
  };

  for (const [index, originalLine] of lines.entries()) {
    if (noise.test(originalLine) || dailyBalance.test(originalLine)) continue;
    let line = originalLine;
    const dateMatch = line.match(dateToken);
    if (dateMatch) {
      flush(undefined, index + 1);
      currentDate = dateMatch[1];
      line = line.slice((dateMatch.index ?? 0) + dateMatch[0].length).trim();
      if (!line) continue;
    }

    const money = line.match(amountToken);
    if (money) {
      const beforeAmount = line.slice(0, money.index).trim();
      if (operation.test(beforeAmount)) {
        startOperation(beforeAmount, index);
      } else if (beforeAmount && pendingState.current) {
        pendingState.current.lines.push(beforeAmount);
      }
      if (pendingState.current) flush({ sign: money[1], amount: money[2] }, index + 1);
      else ignored++;
      continue;
    }

    if (startOperation(line, index)) continue;
    if (pendingState.current) pendingState.current.lines.push(line);
    else if (/\b(?:pix|pagamento|transfer|boleto|recebido|recebida|qr code)\b/i.test(line)) ignored++;
  }
  flush(undefined, lines.length);
  return { rows, ignored };
}
