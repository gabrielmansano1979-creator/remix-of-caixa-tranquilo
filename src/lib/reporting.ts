import { toE164 } from "@/lib/phone";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type ReportFormat = "pdf" | "excel" | "csv";
export type ReportColumn = { key: string; label: string };
export type ReportRow = Record<string, string | number | null>;

export async function exportReport({
  title,
  fileName,
  format,
  columns,
  rows,
  summary = [],
}: {
  title: string;
  fileName: string;
  format: ReportFormat;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary?: Array<[string, string | number]>;
}) {
  if (format === "csv") {
    const values = [
      [title],
      ...summary,
      [],
      columns.map((column) => column.label),
      ...rows.map((row) => columns.map((column) => row[column.key] ?? "")),
    ];
    const csv =
      "\uFEFF" +
      values
        .map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";"))
        .join("\r\n");
    download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${fileName}.csv`);
    return;
  }

  if (format === "excel") {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const summarySheet = workbook.addWorksheet("Resumo");
    summarySheet.addRows([[title], ...summary]);
    const detailSheet = workbook.addWorksheet("Detalhamento");
    detailSheet.addRow(columns.map((column) => column.label));
    rows.forEach((row) => detailSheet.addRow(columns.map((column) => row[column.key] ?? "")));
    const buffer = await workbook.xlsx.writeBuffer();
    download(
      new Blob([new Uint8Array(buffer)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      `${fileName}.xlsx`,
    );
    return;
  }

  const pdf = new jsPDF({ orientation: "landscape" });
  pdf.setFontSize(16);
  pdf.text(title, 14, 18);
  if (summary.length) {
    pdf.setFontSize(10);
    summary.forEach(([label, value], index) => pdf.text(`${label}: ${value}`, 14, 27 + index * 6));
  }
  autoTable(pdf, {
    startY: 31 + summary.length * 6,
    head: [columns.map((column) => column.label)],
    body: rows.map((row) => columns.map((column) => String(row[column.key] ?? "—"))),
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [24, 38, 58] },
  });
  pdf.save(`${fileName}.pdf`);
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export type ReportPeriod = "mensal" | "anual";
export type ReportChannel = "download" | "whatsapp";

export type ExportOptions = {
  period: ReportPeriod;
  format: ReportFormat;
  channel: ReportChannel;
  companyName: string;
  businessSize?: string | null;
  accountantOnly?: boolean;
  accountantName: string;
  accountantWhatsapp: string;
  year?: number;
  month?: number;
};

export async function generateAccountingReport(options: ExportOptions, rows: ReportRow[]) {
  const safeCompany = options.companyName || "Empresa";
  const label =
    options.period === "mensal"
      ? `Mês ${String(options.month ?? new Date().getMonth() + 1).padStart(2, "0")}/${options.year ?? new Date().getFullYear()}`
      : `Ano ${options.year ?? new Date().getFullYear()}`;
  const income = rows
    .filter((row) => row.type === "Receita")
    .reduce((total, row) => total + Number(row.amount_cents ?? 0), 0);
  const expense = rows
    .filter((row) => row.type === "Despesa")
    .reduce((total, row) => total + Number(row.amount_cents ?? 0), 0);
  const money = (cents: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  const fileName = `relatorio-${safeCompany.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}-${options.period}`;

  const expenseByDescription = new Map<string, number>();
  rows.filter((row) => row.type === "Despesa").forEach((row) => {
    const description = String(row.description ?? "Despesa sem descrição").trim() || "Despesa sem descrição";
    expenseByDescription.set(description, (expenseByDescription.get(description) ?? 0) + Number(row.amount_cents ?? 0));
  });
  const largestExpenses = [...expenseByDescription.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const summary: Array<[string, string | number]> = [
    ["Período", label],
    ...(options.businessSize ? [["Porte empresarial declarado", options.businessSize] as [string, string]] : []),
    ["Entradas / receitas registradas", money(income)],
    ["Saídas / despesas registradas", money(expense)],
    [income >= expense ? "Saldo líquido dos lançamentos" : "Déficit dos lançamentos", money(Math.abs(income - expense))],
  ];
  if (options.businessSize && options.period === "anual") {
    summary.push(["Média mensal de entradas (total anual dividido por 12)", money(income / 12)]);
    summary.push(["Observação", "A média considera os 12 meses do ano; confirme se o histórico está completo."]);
  }
  summary.push(["Maiores destinos identificáveis pelas descrições (não são categorias contábeis)", largestExpenses.map(([description, cents]) => `${description}: ${money(cents)}`).join(" | ") || "Sem despesas registradas no período"]);
  summary.push(["Nota tributária", "Documento informativo para análise do contador. Não contém cálculo de tributos nem substitui escrituração ou declaração oficial."]);

  await exportReport({
    title: `Relatório financeiro — ${safeCompany}`,
    fileName,
    format: options.format,
    columns: [
      { key: "type", label: "Tipo" },
      { key: "description", label: "Descrição" },
      { key: "amount", label: "Valor (R$)" },
      { key: "due_date", label: "Vencimento" },
      { key: "status", label: "Status" },
    ],
    rows: rows.map((row) => ({ ...row, amount: money(Number(row.amount_cents ?? 0)) })),
    summary,
  });

  if (options.channel === "whatsapp") {
    const phone = toE164(options.accountantWhatsapp);
    if (!phone) return false;
    const message = [
      `Olá, ${options.accountantName || "contador"}!`,
      `Segue o resumo financeiro de ${safeCompany} referente a ${label}:`,
      `Receitas: ${money(income)}`,
      `Despesas: ${money(expense)}`,
      `${income >= expense ? "Saldo" : "Déficit"}: ${money(Math.abs(income - expense))}`,
      "",
      "O relatório completo foi baixado no dispositivo. Anexe o arquivo nesta conversa, se necessário.",
    ].join("\n");
    window.open(
      `https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }
  return true;
}

export function getPartnerAffiliateLinks(couponCode: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const ref = encodeURIComponent(couponCode);
  return {
    home: `${origin}/?ref=${ref}`,
    checkout: `${origin}/checkout?ref=${ref}`,
  };
}

export function validateCrcNumber(value: string) {
  return /^[A-Z]{2}-\d{6}\/[A-Z]$/.test(value.toUpperCase());
}

export function formatPixKeyType(value: string) {
  const map: Record<string, string> = {
    cpf: "CPF",
    cnpj: "CNPJ",
    email: "E-mail",
    phone: "Telefone",
    random: "Aleatória",
  };
  return map[value] ?? value;
}

export function antiSelfReferralCheck(
  couponPartnerId: string | null,
  currentUserId: string | null,
) {
  if (!couponPartnerId || !currentUserId) return { allowed: true, reason: "" };
  if (couponPartnerId === currentUserId) {
    return {
      allowed: false,
      reason: "Você não pode utilizar seu próprio cupom de indicação para assinar um plano.",
    };
  }
  return { allowed: true, reason: "Cupom válido para parceiro externo." };
}

export function makeAffiliateCouponSeed(seed?: string) {
  return seed || Math.random().toString(36).substring(2, 8).toUpperCase();
}
