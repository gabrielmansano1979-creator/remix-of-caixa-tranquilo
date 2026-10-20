import { exportReport, type ReportColumn, type ReportRow } from "@/lib/reporting";

export type FinancialDocumentInput = {
  companyName: string;
  title: string;
  slug: string;
  periodStart: string;
  periodEnd: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  summary?: Array<[string, string | number]>;
};

/** Gera um PDF independente com nome explícito, empresa e intervalo do relatório. */
export async function downloadFinancialDocument(input: FinancialDocumentInput) {
  const safe = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const company = input.companyName.trim() || "empresa";
  const range = `${input.periodStart}-a-${input.periodEnd}`;
  await exportReport({
    title: input.title,
    fileName: `critical-cash-${safe(input.slug)}-${safe(company)}-${range}`,
    format: "pdf",
    columns: input.columns,
    rows: input.rows,
    summary: [
      ["Empresa", company],
      ["Período", `${input.periodStart} a ${input.periodEnd}`],
      ["Gerado em", new Date().toLocaleString("pt-BR")],
      ...(input.summary ?? []),
    ],
  });
}
