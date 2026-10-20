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

  const pdf = new jsPDF({ orientation: columns.length > 3 ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const normalizedTitle = String(title || "Relatório Critical Cash").replace(/[\\r\\n]+/g, " ").trim();
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  const titleLines = pdf.splitTextToSize(normalizedTitle, pageWidth - margin * 2);
  pdf.text(titleLines, margin, 14);

  let summaryY = 18 + titleLines.length * 5;
  if (summary.length) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    for (const [label, value] of summary) {
      const wrapped = pdf.splitTextToSize(`${String(label)}: ${String(value ?? "—")}`, pageWidth - margin * 2);
      if (summaryY + wrapped.length * 4.1 > pageHeight - 18) break;
      pdf.text(wrapped, margin, summaryY);
      summaryY += wrapped.length * 4.1 + 1;
    }
  }

  const firstTableY = Math.min(Math.max(summaryY + 3, 30 + titleLines.length * 4), pageHeight - 28);
  autoTable(pdf, {
    startY: firstTableY,
    margin: { top: 16, right: margin, bottom: 13, left: margin },
    head: [columns.map((column) => String(column.label ?? ""))],
    body: rows.map((row) => columns.map((column) => String(row[column.key] ?? "—"))),
    styles: {
      font: "helvetica",
      fontSize: columns.length > 6 ? 6.5 : columns.length > 4 ? 7 : 8,
      cellPadding: 2.2,
      overflow: "linebreak",
      valign: "top",
      lineColor: [220, 225, 231],
      lineWidth: 0.1,
    },
    headStyles: { fillColor: [24, 38, 58], textColor: [255, 255, 255], fontStyle: "bold", valign: "middle" },
    alternateRowStyles: { fillColor: [246, 248, 250] },
    columnStyles: Object.fromEntries(columns.map((column, index) => [index, { cellWidth: "auto", overflow: "linebreak" }])),
    horizontalPageBreak: columns.length > 5,
    horizontalPageBreakRepeat: [0],
    rowPageBreak: "auto",
    showHead: "everyPage",
    didDrawPage: (data) => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(90, 98, 110);
      pdf.text("Critical Cash · Exportação em PDF", margin, pageHeight - 6);
      pdf.text(`Página ${data.pageNumber}`, pageWidth - margin, pageHeight - 6, { align: "right" });
    },
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
  if (options.accountantOnly && options.period === "anual") {
    summary.push(["Total anual de entradas registradas (não necessariamente faturamento tributável)", money(income)]);
    summary.push(["Média mensal de entradas (total anual dividido por 12)", money(income / 12)]);
    summary.push(["Observação", "Média calculada sobre 12 meses; confirme a completude do histórico e classifique transferências, empréstimos e aportes antes de usar como faturamento."]);
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
