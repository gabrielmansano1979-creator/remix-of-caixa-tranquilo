export interface CsvRow {
  line: number;
  raw: Record<string, string>;
  errors: string[];
  value?: { type: "income" | "expense"; description: string; amount_cents: number; due_date: string; counterparty_name: string; counterparty_email: string; counterparty_whatsapp: string; sender_name?: string; recipient_name?: string; counterparty_document?: string; counterparty_original_name?: string; payment_method?: string; is_own_transfer?: boolean };
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
        /\b(?:recebido|recebida|creditado|creditada)\s+(?:de|do|da|dos|das)\s+(.+)$/i,
        /\b(?:remetente|pagador|ordenante|origem)\s*[:=-]\s*(.+)$/i,
      ]
    : [
        /\b(?:pix|ted|doc|transfer[eê]ncia|transfer)\s+(?:enviado|enviada|feito)\s+(?:para|a|ao|à|pro|pra)\s+(.+)$/i,
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
  const datePattern = /(?:^|\s)(\d{2}[/. -]\d{2}[/. -]\d{4}|\d{4}-\d{2}-\d{2})(?=\s|$)/;
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
    cell.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim()
  );
  const dateIndex = header.findIndex((h) => /^(data|date|data lancamento|data movimento|dt lancamento|dt movimento|posting date|transaction date|data transacao|data da transacao)$/.test(h));
  const descriptionIndex = header.findIndex((h) => /^(descricao|historico|lancamento|detalhe|memo|description|payee|beneficiario|estabelecimento|transacao|transaction|nome)$/.test(h));
  const amountIndex = header.findIndex((h) => /^(valor|amount|quantia|montante|valor r\$|amount brl|total)$/.test(h));
  const debitIndex = header.findIndex((h) => /^(debito|debit|saidas|saida|withdrawal|debit amount)$/.test(h));
  const creditIndex = header.findIndex((h) => /^(credito|credit|entradas|entrada|deposit|deposito|credit amount)$/.test(h));
  const typeIndex = header.findIndex((h) => /^(tipo|type|natureza|operacao|operation|direcao)$/.test(h));
  const senderIndex = header.findIndex((h) => /^(remetente|pagador|ordenante|origem|sender|payer|from)$/.test(h));
  const recipientIndex = header.findIndex((h) => /^(destinatario|favorecido|beneficiario|recebedor|payee|recipient|to)$/.test(h));
  const counterpartyIndex = header.findIndex((h) => /^(nome|contraparte|counterparty|nome contraparte|nome favorecido|nome remetente)$/.test(h));
  if (dateIndex < 0 || descriptionIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) {
    return { rows: [], headerError: "Não reconheci as colunas. Preciso identificar data, descrição e valor (ou débito/crédito).", ignored: 0 };
  }

  const rows: CsvRow[] = [];
  let ignored = 0;
  for (const [index, line] of lines.slice(1).entries()) {
    const cells = splitLine(line, separator);
    const rawDate = cells[dateIndex] ?? "";
    const date = normalizeStatementDate(rawDate);
    const description = (cells[descriptionIndex] ?? "").slice(0, 200);
    const debitRaw = debitIndex >= 0 ? cells[debitIndex] ?? "" : "";
    const creditRaw = creditIndex >= 0 ? cells[creditIndex] ?? "" : "";
    const amountRaw = amountIndex >= 0 ? cells[amountIndex] ?? "" : "";
    const debit = parseMoney(debitRaw.replace(/^[+-]/, ""));
    const credit = parseMoney(creditRaw.replace(/^[+-]/, ""));
    const signedNegative = /^\s*-/.test(amountRaw) || /^\s*\\(.*\\)\s*$/.test(amountRaw);
    const amount = amountIndex >= 0 ? parseMoney(amountRaw.replace(/^[+-]/, "").replace(/[()]/g, "")) : null;
    const chosenAmount = debit !== null ? debit : credit !== null ? credit : amount;
    if (!date || !description || chosenAmount === null) {
      ignored++;
      continue;
    }
    const rawType = typeIndex >= 0 ? (cells[typeIndex] ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : "";
    const type = debit !== null ? "expense"
      : credit !== null ? "income"
      : signedNegative || /debito|saida|despesa|pagamento|withdrawal|expense/.test(rawType) ? "expense"
      : /credito|entrada|receita|deposito|recebimento|income/.test(rawType) ? "income"
      : null;
    const errors = type ? [] : ["A linha foi lida, mas o arquivo não informa se o valor é entrada ou saída; classifique manualmente."];
    const explicitSender = senderIndex >= 0 ? (cells[senderIndex] ?? "").trim().slice(0, 120) : "";
    const explicitRecipient = recipientIndex >= 0 ? (cells[recipientIndex] ?? "").trim().slice(0, 120) : "";
    const parties = extractTransferParties(description);
    const sender = explicitSender || parties.sender || (type === "income" ? extractCounterparty(description, type) : "");
    const recipient = explicitRecipient || parties.recipient || (type === "expense" ? extractCounterparty(description, type) : "");
    const explicitCounterparty = type === "income"
      ? (sender || (counterpartyIndex >= 0 ? cells[counterpartyIndex] ?? "" : ""))
      : type === "expense"
        ? (recipient || (counterpartyIndex >= 0 ? cells[counterpartyIndex] ?? "" : ""))
        : (counterpartyIndex >= 0 ? cells[counterpartyIndex] ?? "" : "");
    const counterparty = explicitCounterparty.trim().slice(0, 120);
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
      },
      errors,
    };
    if (type && counterparty && !errors.length) row.value = {
      type, description, amount_cents: chosenAmount, due_date: date,
      counterparty_name: counterparty, counterparty_email: "", counterparty_whatsapp: "",
    };
    rows.push(row);
  }
  return { rows, ignored };
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
  const dateHeader = /^\s*(\d{2}\/\d{2}\/\d{4})\s*$/;
  const amountLine = /^\s*([+-])\s*R\$\s*((?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})\s*$/i;
  const dailyBalance = /^\s*Saldo\s+do\s+dia\b/i;
  const noise = /^(?:Extrato do per[ií]odo|Saldo inicial dispon[ií]vel|Total de entradas|Total de sa[ií]das|Saldo final dispon[ií]vel|Ouvidoria:|Extrato gerado no dia|p[aá]g\.?\s*\d+\s+de\s+\d+|Cora SCFI\s*[-–]\s*CNPJ)/i;
  const operation = /^(?:Pgto\s+QR\s+Code\s+Pix|Transf\s+Pix\s+(?:enviada|recebida)|Pagamento\s+(?:da\s+fatura|recebido)|Pix\s+(?:enviado|recebido)|Transfer[eê]ncia\s+(?:enviada|recebida))/i;
  type Pending = { date: string; operation: string; lines: string[]; startLine: number };
  let pending: Pending | null = null;
  let currentDate = "";
  const rows: CsvRow[] = [];
  let ignored = 0;

  const flush = (signedAmount?: { sign: string; amount: string }, endLine = 0) => {
    if (!pending) return;
    if (!signedAmount) { ignored++; pending = null; return; }
    const cents = parseMoney(signedAmount.amount);
    const date = parseDate(pending.date);
    const detailLines = pending.lines.map((line) => line.trim())
      .filter((line) => line && !noise.test(line) && !dailyBalance.test(line));
    const docLine = detailLines.find((line) =>
      /\b(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/.test(line)
    ) ?? "";
    const document = docLine.match(/\b(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/)?.[0] ?? "";
    const originalCounterparty = detailLines.map((line) =>
      line.replace(/\b(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/g, "")
        .replace(/\b(?:CPF|CNPJ)\b\s*[:.]?/ig, "")
        .replace(/[|/—–-]+\s*$/g, "").trim()
    ).find((line) => line && !/^(?:CPF|CNPJ)\b/i.test(line) &&
      !/^(?:Extrato gerado|P[aá]g\.?\s*\d)/i.test(line)
    ) ?? "";
    const counterparty = originalCounterparty.replace(/\s*(?:\.{2,}|…+)\s*$/u, "")
      .replace(/\s+/g, " ").trim().slice(0, 120);
    const type = signedAmount.sign === "+" ? "income" : "expense";
    const method = /pix|qr code/i.test(pending.operation) ? "PIX"
      : /fatura/i.test(pending.operation) ? "Pagamento de fatura"
      : /pagamento recebido/i.test(pending.operation) ? "Boleto / pagamento"
      : "Transferência / pagamento";
    const originalDescription = [pending.operation, ...detailLines].join(" — ").slice(0, 200);
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
      line: pending.startLine || endLine,
      raw: {
        descricao: originalDescription,
        valor: signedAmount.sign + "R$ " + signedAmount.amount,
        vencimento: pending.date,
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
      type, description: (pending.operation + (counterparty ? " — " + counterparty : "")).slice(0, 200),
      amount_cents: cents, due_date: date, counterparty_name: counterparty,
      counterparty_email: "", counterparty_whatsapp: "",
      sender_name: sender.slice(0, 120), recipient_name: recipient.slice(0, 120),
      counterparty_document: document.slice(0, 32),
      counterparty_original_name: originalCounterparty.slice(0, 120),
      payment_method: method.slice(0, 60),
      is_own_transfer: isOwnTransfer,
    };
    rows.push(row);
    pending = null;
  };

  for (const [index, line] of lines.entries()) {
    if (noise.test(line) || dailyBalance.test(line)) continue;
    const dateMatch = line.match(dateHeader);
    if (dateMatch) { flush(undefined, index + 1); currentDate = dateMatch[1]; continue; }
    const amountMatch = line.match(amountLine);
    if (amountMatch) {
      if (!pending) { ignored++; continue; }
      flush({ sign: amountMatch[1], amount: amountMatch[2] }, index + 1);
      continue;
    }
    if (operation.test(line)) {
      flush(undefined, index + 1);
      if (!currentDate) { ignored++; continue; }
      const operationMatch = line.match(operation);
      const operationName = operationMatch?.[0] ?? line;
      const trailingCounterparty = line.slice(operationName.length).trim();
      pending = { date: currentDate, operation: operationName, lines: trailingCounterparty ? [trailingCounterparty] : [], startLine: index + 1 };
      continue;
    }
    if (pending) pending.lines.push(line);
    else if (/\b(?:pix|pagamento|transfer|boleto|recebido|recebida|qr code)\b/i.test(line)) ignored++;
  }
  flush(undefined, lines.length);
  return { rows, ignored };
}
