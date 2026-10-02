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
  let t = s.replace(/[R$\s]/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export function parseDate(s: string): string | null {
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  let iso: string | null = null;
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
  const need = ["descricao", "valor", "vencimento", "tipo", "nome", "whatsapp"];
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
    if (type === "income" && !wa) errors.push("WhatsApp obrigatório para entrada");
    const row: CsvRow = { line: i + 2, raw, errors };
    if (!errors.length) row.value = { type: type!, description, amount_cents: amount!, due_date: date!, counterparty_name: raw.nome.slice(0, 120), counterparty_email: email, counterparty_whatsapp: wa ?? "" };
    return row;
  });
  return { rows };
}
