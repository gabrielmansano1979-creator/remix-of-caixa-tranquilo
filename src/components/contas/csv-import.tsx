import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Download, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { accessQuery, parseDbError, type LimitKind } from "@/lib/app-data";
import { CSV_TEMPLATE, parseCsv, parseStatementText, type CsvRow } from "@/lib/csv";
import { formatBRL, formatDate } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function CsvImportDialog({ open, onOpenChange, onLimit }: { open: boolean; onOpenChange: (o: boolean) => void; onLimit: (k: LimitKind, m: string) => void }) {
  const qc = useQueryClient();
  const { data: access } = useQuery(accessQuery);
  const [rows, setRows] = useState<CsvRow[] | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [fileWarning, setFileWarning] = useState<string | null>(null);
  const valid = rows?.filter((r) => r.value) ?? [];
  const maxRows = access?.limits.csv_rows ?? 0;

  const close = (o: boolean) => { if (!o) { setRows(null); setFileErr(null); setFileWarning(null); } onOpenChange(o); };

  const onFile = async (f?: File) => {
    if (!f) return;
    if (f.size > 20_000_000) return setFileErr("Arquivo muito grande (máx. 20 MB).");
    const extension = "." + (f.name.split(".").pop()?.toLowerCase() ?? "");
    if (![".csv", ".xlsx", ".pdf"].includes(extension)) {
      setFileErr("Formato não suportado. Envie somente PDF, CSV ou Excel (.xlsx).");
      setRows(null);
      return;
    }
    setFileErr(null);
    setFileWarning(null);
    setRows(null);
    try {
      const extension = f.name.split(".").pop()?.toLowerCase();
      if (extension === "csv") {
        const parsed = parseCsv(await f.text());
        if (parsed.headerError) throw new Error(parsed.headerError);
        setRows(parsed.rows);
        return;
      }
      if (extension === "xlsx") {
        const ExcelJS = (await import("exceljs")).default;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await f.arrayBuffer());
        const parsedSheets = workbook.worksheets.map((sheet) => {
          const rows: string[] = [];
          sheet.eachRow({ includeEmpty: false }, (row) => {
            const values: string[] = [];
            row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
              values[columnNumber - 1] = excelCellToString(cell.value);
            });
            rows.push(values.map((value) => `"${value.replace(/"/g, '""')}"`).join(","));
          });
          return parseCsv(rows.join("\n"));
        });
        const usableSheets = parsedSheets.filter((parsed) => !parsed.headerError);
        if (!usableSheets.length) throw new Error(parsedSheets[0]?.headerError ?? "Nenhuma aba contém as colunas de lançamentos esperadas.");
        const combined = usableSheets.flatMap((parsed) => parsed.rows);
        if (combined.length > 5000) throw new Error("A planilha excede o limite de 5.000 linhas para pré-visualização.");
        setRows(combined.map((row, index) => ({ ...row, line: index + 2 })));
        const skippedSheets = parsedSheets.length - usableSheets.length;
        if (skippedSheets) setFileWarning(`${skippedSheets} aba(s) sem as colunas de lançamentos esperadas foram ignoradas.`);
        return;
      }
      if (extension === "pdf") {
        const extracted = await extractPdfText(f);
        const parsed = parseStatementText(extracted.text);
        if (!parsed.rows.length) throw new Error("Não foram encontradas linhas de lançamentos reconhecíveis no PDF.");
        setRows(parsed.rows);
        if (parsed.ignored) setFileWarning(`${parsed.ignored} linha(s) do documento não foram reconhecidas como lançamentos e serão ignoradas.`);
        if (extracted.ocrPages) setFileWarning((current) => `${current ? `${current} ` : ""}${extracted.ocrPages} página(s) precisaram de OCR. Confira cada valor com o PDF original.`);
        return;
      }
      throw new Error("Formato não suportado. Envie somente PDF, CSV ou Excel (.xlsx).");
    } catch (error) {
      setFileErr(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
      setRows(null);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob(["\uFEFF" + CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "modelo-caixa-critico.csv" });
    a.click();
    URL.revokeObjectURL(url);
  };

  const imp = useMutation({
    mutationFn: async () => {
      if (valid.length > maxRows) throw new Error("LIMIT_CSV");
      const { data, error } = await supabase.rpc("import_entries", { _rows: valid.flatMap((r) => r.value ? [r.value] : []) });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["entries"] });
      qc.invalidateQueries({ queryKey: ["projection"] });
      toast.success(`${n} conta(s) importada(s).`);
      close(false);
    },
    onError: (e) => {
      const p = parseDbError(e);
      if (p.kind) { close(false); onLimit(p.kind, p.message + (p.kind === "csv" ? ` Seu plano permite até ${maxRows} linhas.` : "")); }
      else toast.error(p.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar lançamentos</DialogTitle>
          <DialogDescription>Selecione CSV, Excel ou extrato PDF (com leitura OCR quando necessário). Confira a prévia antes de importar até {maxRows} linhas.</DialogDescription>
        </DialogHeader>
        {!rows ? (
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center hover:border-primary focus-within:border-primary">
              <Upload className="h-8 w-8 text-primary" />
              <span className="font-medium">Escolher arquivo CSV, Excel ou PDF</span>
              <span className="text-xs text-muted-foreground">Planilhas: colunas descricao, valor, vencimento, tipo e nome. PDFs passam por revisão antes de gravar.</span>
              <input type="file" accept=".csv,.xlsx,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {fileErr && <p className="flex items-center gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger" role="alert"><AlertCircle className="h-4 w-4" />{fileErr}</p>}
            {fileWarning && <p className="flex items-center gap-2 rounded-xl bg-warning/10 p-3 text-sm text-warning" role="status"><AlertCircle className="h-4 w-4" />{fileWarning}</p>}
            <Button variant="link" className="px-0" onClick={download}><Download className="mr-2 h-4 w-4" />Baixar modelo CSV</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="flex items-center gap-1.5 text-success"><CheckCircle2 className="h-4 w-4" />{valid.length} válida(s)</span>
              <span className="flex items-center gap-1.5 text-danger"><AlertCircle className="h-4 w-4" />{rows.length - valid.length} com erro</span>
            </div>
            {valid.length > maxRows && (
              <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning" role="alert">O arquivo tem {valid.length} linhas válidas; seu plano permite {maxRows}.</p>
            )}
            {fileWarning && <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning" role="status">{fileWarning}</p>}
            <div className="max-h-80 overflow-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                  <tr><th className="p-2">Linha</th><th className="p-2">Descrição</th><th className="p-2">Valor</th><th className="p-2">Venc.</th><th className="p-2">Situação</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className={`border-t ${r.errors.length ? "bg-danger/5" : ""}`}>
                      <td className="p-2 num text-muted-foreground">{r.line}</td>
                      <td className="p-2">{r.raw.descricao || "—"}</td>
                      <td className="p-2 num">{r.value ? formatBRL(r.value.amount_cents) : r.raw.valor}</td>
                      <td className="p-2 num">{r.value ? formatDate(r.value.due_date) : r.raw.vencimento}</td>
                      <td className="p-2">
                        {r.errors.length
                          ? <span className="flex items-start gap-1 text-danger"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{r.errors.join("; ")}</span>
                          : <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" />OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => setRows(null)}>Escolher outro arquivo</Button>
              <Button className="h-11 rounded-xl" disabled={!valid.length || imp.isPending} onClick={() => imp.mutate()}>
                Importar {valid.length} conta(s)
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function excelCellToString(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value && (typeof value.result === "string" || typeof value.result === "number")) return String(value.result);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((fragment) => typeof fragment === "object" && fragment && "text" in fragment ? String(fragment.text) : "").join("");
    }
  }
  return "";
}

async function extractPdfText(file: File): Promise<{ text: string; ocrPages: number }> {
  const pdfjs = await import("pdfjs-dist");
  const { createWorker } = await import("tesseract.js");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (pdf.numPages > 30) throw new Error("O PDF excede o limite de 30 páginas.");
  const pages: string[] = [];
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let ocrPages = 0;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const textLines: Array<{ y: number; text: string }> = [];
      for (const item of content.items) {
        if (!("str" in item) || !("transform" in item)) continue;
        const y = Math.round(item.transform[5] / 2) * 2;
        const previous = textLines[textLines.length - 1];
        if (previous && Math.abs(previous.y - y) <= 2) previous.text += ` ${item.str}`;
        else textLines.push({ y, text: item.str });
      }
      let text = textLines.map((line) => line.text).join("\n");
      if (text.replace(/\s/g, "").length < 30) {
        worker ??= await createWorker("por");
        const viewport = page.getViewport({ scale: 1.8 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("O navegador não conseguiu preparar a página do PDF para OCR.");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const recognized = await worker.recognize(canvas);
        text = recognized.data.text;
        ocrPages++;
        canvas.width = 0;
        canvas.height = 0;
      }
      pages.push(text);
    }
  } finally {
    if (worker) await worker.terminate();
  }

  return { text: pages.join("\n"), ocrPages };
}
