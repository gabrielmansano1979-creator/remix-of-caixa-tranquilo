import { toE164 } from "@/lib/phone";

export type ReportPeriod = "mensal" | "anual";
export type ReportFormat = "pdf" | "excel" | "csv";
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

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const fallbackRows = [
  { tipo: "Receita", descricao: "Assinaturas de clientes", valor: 184500, status: "Recebido" },
  { tipo: "Despesa", descricao: "Marketing e tráfego", valor: 45600, status: "Em análise" },
  { tipo: "Receita", descricao: "Serviços de consultoria", valor: 97500, status: "Recebido" },
  { tipo: "Despesa", descricao: "Taxas bancárias", valor: 13200, status: "Pago" },
];

const downloadBlob = (blob: Blob, fileName: string) => {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);

const generateSummary = (options: ExportOptions) => {
  const totalReceita = fallbackRows.filter((row) => row.tipo === "Receita").reduce((sum, row) => sum + row.valor, 0);
  const totalDespesa = fallbackRows.filter((row) => row.tipo === "Despesa").reduce((sum, row) => sum + row.valor, 0);
  const lucro = totalReceita - totalDespesa;
  const label = options.period === "mensal" ? `Mês ${String(options.month ?? 10).padStart(2, "0")}/${options.year ?? 2026}` : `Ano ${options.year ?? 2026}`;

  return { label, totalReceita, totalDespesa, lucro, rows: fallbackRows };
};

export function generateAccountingReport(options: ExportOptions) {
  const summary = generateSummary(options);
  const safeCompany = options.companyName || "Empresa";
  const filenameBase = `relatorio-${safeCompany.toLowerCase().replace(/\s+/g, "-")}-${options.period}`;

  if (options.format === "csv") {
    const csv = [
      ["Empresa", safeCompany],
      ["Período", summary.label],
      ["Tipo", "Descrição", "Valor", "Status"],
      ...summary.rows.map((row) => [row.tipo, row.descricao, String(row.valor), row.status]),
    ]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `${filenameBase}.csv`);
    return true;
  }

  if (options.format === "excel") {
    const workbook = [
      ["Empresa", safeCompany],
      ["Período", summary.label],
      [""],
      ["Tipo", "Descrição", "Valor", "Status"],
      ...summary.rows.map((row) => [row.tipo, row.descricao, formatCurrency(row.valor), row.status]),
    ]
      .map((row) => row.join("\t"))
      .join("\n");

    downloadBlob(new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8;" }), `${filenameBase}.xls`);
    return true;
  }

  const content = [
    `Relatório contábil — ${safeCompany}`,
    `Período: ${summary.label}`,
    `Receita total: ${formatCurrency(summary.totalReceita)}`,
    `Despesa total: ${formatCurrency(summary.totalDespesa)}`,
    `Lucro líquido: ${formatCurrency(summary.lucro)}`,
    "",
    "Tipo,Descrição,Valor,Status",
    ...summary.rows.map((row) => `${row.tipo},${row.descricao},${formatCurrency(row.valor)},${row.status}`),
  ].join("\n");

  downloadBlob(new Blob([content], { type: "application/pdf;charset=utf-8;" }), `${filenameBase}.txt`);

  if (options.channel === "whatsapp") {
    const phone = toE164(options.accountantWhatsapp);
    if (!phone) return false;
    const message = [
      `Olá, ${options.accountantName || "contador"}!`,
      `Segue o resumo financeiro de ${safeCompany} referente a ${summary.label}:`,
      `Receitas: ${formatCurrency(summary.totalReceita)}`,
      `Despesas: ${formatCurrency(summary.totalDespesa)}`,
      `${summary.lucro >= 0 ? "Lucro líquido" : "Prejuízo"}: ${formatCurrency(Math.abs(summary.lucro))}`,
      "",
      "O relatório completo foi baixado no dispositivo. Anexe o arquivo nesta conversa, se necessário.",
    ].join("\n");
    window.open(`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  return true;
}

export function getPartnerAffiliateLinks(couponCode: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://example.com";
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

export function makeAffiliateCouponSeed() {
  const base = "PARCEIRO";
  return `${base}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
}

export function antiSelfReferralCheck(couponPartnerId: string | null, currentUserId: string | null) {
  if (!couponPartnerId || !currentUserId) return { allowed: true, reason: "" };
  if (couponPartnerId === currentUserId) {
    return {
      allowed: false,
      reason: "Você não pode utilizar seu próprio cupom de parceiro na sua assinatura.",
    };
  }
  return { allowed: true, reason: "Cupom válido para parceiro externo." };
}

export function clampPercent(value: number) {
  return clamp(value, 0, 100);
}
