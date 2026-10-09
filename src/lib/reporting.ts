import { toE164 } from "@/lib/phone";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export type ReportFormat = "pdf" | "excel" | "csv";
export type ReportColumn = { key: string; label: string };
export type ReportRow = Record<string, string | number | null>;

export function exportReport({
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
    const csv = "\uFEFF" + values.map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    download(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${fileName}.csv`);
    return;
  }

  if (format === "excel") {
    const workbook = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.aoa_to_sheet([[title], ...summary]);
    const detailSheet = XLSX.utils.aoa_to_sheet([columns.map((column) => column.label), ...rows.map((row) => columns.map((column) => row[column.key] ?? ""))]);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Resumo");
    XLSX.utils.book_append_sheet(workbook, detailSheet, "Detalhamento");
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
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
  URL.revokeObjectURL(url);
}

export type ReportPeriod = "mensal" | "anual";
export type ReportChannel = "download" | "whatsapp";

export type ExportOptions = {
  period: ReportPeriod;
  format: ReportFormat;
  channel: ReportChannel;
  companyName: string;
  accountantName: string;
  accountantWhatsapp: string;
  year?: number;
  month?: number;
};

export function generateAccountingReport(options: ExportOptions, rows: ReportRow[]) {
  const safeCompany = options.companyName || "Empresa";
  const label = options.period === "mensal"
    ? `Mês ${String(options.month ?? new Date().getMonth() + 1).padStart(2, "0")}/${options.year ?? new Date().getFullYear()}`
    : `Ano ${options.year ?? new Date().getFullYear()}`;
  const income = rows.filter((row) => row.type === "Receita").reduce((total, row) => total + Number(row.amount_cents ?? 0), 0);
  const expense = rows.filter((row) => row.type === "Despesa").reduce((total, row) => total + Number(row.amount_cents ?? 0), 0);
  const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
  const fileName = `relatorio-${safeCompany.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-")}-${options.period}`;

  exportReport({
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
    summary: [["Período", label], ["Receitas", money(income)], ["Despesas", money(expense)], [income >= expense ? "Saldo" : "Déficit", money(Math.abs(income - expense))]],
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
    window.open(`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }
  return true;
}

export function getPartnerAffiliateLinks(couponCode: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const ref = encodeURIComponent(couponCode);
  return {
    home: `${origin}/?ref=${ref}`,
    checkout: `${origin}/planos?ref=${ref}`,
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

export function antiSelfReferralCheck(couponPartnerId: string | null, currentUserId: string | null) {
  if (!couponPartnerId || !currentUserId) return { allowed: true, reason: "" };
  if (couponPartnerId === currentUserId) {
    return { allowed: false, reason: "Você não pode utilizar seu próprio cupom de indicação para assinar um plano." };
  }
  return { allowed: true, reason: "Cupom válido para parceiro externo." };
}
