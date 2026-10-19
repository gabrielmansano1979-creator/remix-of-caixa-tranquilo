export interface CsvRow {
  line: number;
  raw: Record<string, string>;
  errors: string[];
  value?: { type: "income" | "expense"; description: string; amount_cents: number; due_date: string; counterparty_name: string; counterparty_email: string; counterparty_whatsapp: string };
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
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  let iso: string | null = null;
  if (m) iso = `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{2})[-.](\d{2})[-.](\d{4})$/);
  if (m) iso = `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) iso = s;
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00Z");
  return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return parseDate(raw);
  const normalized = raw.replace(/[.-]/g, "/");
  return parseDate(normalized);
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
    if (!description) errors.push("Descrição não identificada no documento.");

    const row: CsvRow = {
      line: index + 1,
      raw: { descricao: description, valor: amountToken, vencimento: dateMatch[1], tipo: type === "income" ? "entrada" : type === "expense" ? "saida" : "não identificado", nome: "" },
      errors,
    };
    if (!errors.length && type) {
      row.value = {
        type,
        description,
        amount_cents: cents,
        due_date: date,
        counterparty_name: "",
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
    const description = [tag(block, "NAME"), tag(block, "MEMO")].filter(Boolean).join(" — ").slice(0, 200);
    if (!date || amountCents === null || !description) {
      ignored++;
      continue;
    }

    const type = amountNumber < 0 ? "expense" : "income";
    rows.push({
      line: index + 1,
      raw: {
        descricao: description,
        valor: String(Math.abs(amountNumber)),
        vencimento: date,
        tipo: type === "income" ? "entrada" : "saida",
        nome: tag(block, "NAME").slice(0, 120),
      },
      errors: [],
      value: {
        type,
        description,
        amount_cents: amountCents,
        due_date: date,
        counterparty_name: tag(block, "NAME").slice(0, 120),
        counterparty_email: "",
        counterparty_whatsapp: "",
      },
    });
  }
  return { rows, ignored };
}

/** Parse Quicken Interchange Format (QIF) records exported by banks and finance apps. */
export function parseQifText(text: string): { rows: CsvRow[]; ignored: number } {
  const records = text.replace(/^\uFEFF/, "").split(/^\^\s*$/m);
  const rows: CsvRow[] = [];
  let ignored = 0;

  for (const [index, record] of records.entries()) {
    const fields = record.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const get = (prefix: string) => fields.find((line) => line.startsWith(prefix))?.slice(1).trim() ?? "";
    const dateRaw = get("D").replace(/['’](\d{2})$/, "/20$1");
    const date = parseDate(dateRaw);
    const amountRaw = get("T");
    const negative = amountRaw.startsWith("-");
    const amountCents = parseMoney(amountRaw.replace(/^[+-]/, ""));
    const description = [get("P"), get("M")].filter(Boolean).join(" — ").slice(0, 200);
    if (!date || amountCents === null || !description) {
      if (fields.some((line) => /^[DTPM]/.test(line))) ignored++;
      continue;
    }
    const type = negative ? "expense" : "income";
    rows.push({
      line: index + 1,
      raw: { descricao: description, valor: String(amountCents / 100), vencimento: dateRaw, tipo: type === "income" ? "entrada" : "saida", nome: get("P").slice(0, 120) },
      errors: [],
      value: {
        type, description, amount_cents: amountCents, due_date: date,
        counterparty_name: get("P").slice(0, 120), counterparty_email: "", counterparty_whatsapp: "",
      },
    });
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
    const row: CsvRow = {
      line: index + 2,
      raw: {
        descricao: description,
        valor: String(chosenAmount / 100),
        vencimento: rawDate,
        tipo: type === "income" ? "entrada" : type === "expense" ? "saida" : "não identificado",
        nome: "",
      },
      errors,
    };
    if (type) row.value = {
      type, description, amount_cents: chosenAmount, due_date: date,
      counterparty_name: "", counterparty_email: "", counterparty_whatsapp: "",
    };
    rows.push(row);
  }
  return { rows, ignored };
}
