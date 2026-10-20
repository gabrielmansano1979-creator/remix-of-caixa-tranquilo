import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Download, LoaderCircle, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { accessQuery, parseDbError, type LimitKind } from "@/lib/app-data";
import { CSV_TEMPLATE, parseCsv, parseBankTable, parseStatementText, parseCoraStatementText, parsePdfStatementText, parseOfxText, type CsvRow } from "@/lib/csv";
import { formatBRL, formatDate } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function CsvImportDialog({ open, onOpenChange, onLimit }: { open: boolean; onOpenChange: (o: boolean) => void; onLimit: (k: LimitKind, m: string) => void }) {
  const qc = useQueryClient();
  const { data: access } = useQuery(accessQuery);
  const { data: businessName } = useQuery({ queryKey: ["profile-lite"], enabled: open, queryFn: async () => { const { data, error } = await supabase.from("profiles").select("business_name").maybeSingle(); if (error) throw error; return data?.business_name?.trim() || ""; } });
  const [rows, setRows] = useState<CsvRow[] | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [fileWarning, setFileWarning] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const valid = rows?.filter((r) => r.value) ?? [];
  const maxRows = access?.limits.csv_rows ?? 0;

  const close = (o: boolean) => { if (!o) { setRows(null); setFileErr(null); setFileWarning(null); } onOpenChange(o); };

  const onFile = async (f?: File) => {
    if (!f) return;
    setFileErr(null);
    setFileWarning(null);
    setRows(null);
    if (f.size > 20_000_000) {
      setFileErr("Arquivo muito grande (máx. 20 MB).");
      return;
    }
    const extension = "." + (f.name.split(".").pop()?.toLowerCase() ?? "");
    if (![".csv", ".xlsx", ".pdf", ".ofx"].includes(extension)) {
      setFileErr("Formato não suportado. Envie somente CSV, Excel (.xlsx), PDF ou OFX.");
      return;
    }
    setIsReading(true);
    try {
      const extension = f.name.split(".").pop()?.toLowerCase();
      if (extension === "csv") {
        const text = await f.text();
        const parsed = parseCsv(text);
        if (!parsed.headerError) {
          if (!parsed.rows.length) throw new Error("O CSV foi aberto, mas não contém lançamentos reconhecíveis. Confira se a primeira linha contém os cabeçalhos e se o arquivo não está vazio.");
          setRows(parsed.rows);
          return;
        }
        const bankParsed = parseBankTable(text);
        if (bankParsed.headerError) throw new Error(bankParsed.headerError);
        if (!bankParsed.rows.length) throw new Error("O CSV foi lido, mas não contém lançamentos reconhecíveis.");
        setRows(bankParsed.rows);
        if (bankParsed.ignored) setFileWarning(`${bankParsed.ignored} linha(s) foram ignoradas por não conterem data, descrição e valor válidos.`);
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
          const csvText = rows.join("\n");
          const parsed = parseCsv(csvText);
          return parsed.headerError ? parseBankTable(csvText) : parsed;
        });
        const usableSheets = parsedSheets.filter((parsed) => !parsed.headerError);
        if (!usableSheets.length) throw new Error(parsedSheets[0]?.headerError ?? "Nenhuma aba contém as colunas de lançamentos esperadas.");
        const combined = usableSheets.flatMap((parsed) => parsed.rows);
        if (!combined.length) throw new Error("Nenhum lançamento reconhecível foi encontrado nas abas da planilha.");
        if (combined.length > 5000) throw new Error("A planilha excede o limite de 5.000 linhas para pré-visualização.");
        setRows(combined.map((row, index) => ({ ...row, line: index + 2 })));
        const skippedSheets = parsedSheets.length - usableSheets.length;
        if (skippedSheets) setFileWarning(`${skippedSheets} aba(s) sem as colunas de lançamentos esperadas foram ignoradas.`);
        return;
      }
      if (extension === "ofx") {
        const parsed = parseOfxText(await f.text());
        if (!parsed.rows.length) throw new Error("Não foram encontradas transações reconhecíveis no arquivo OFX.");
        setRows(parsed.rows);
        if (parsed.ignored) setFileWarning(`${parsed.ignored} transação(ões) do arquivo não puderam ser interpretadas.`);
        return;
      }
      if (extension === "pdf") {
        let extracted = await extractPdfText(f);
        let isCora = /Cora\s+SCFI|37\.880\.206\/0001-63/i.test(extracted.text);
        let parsed = isCora ? parseCoraStatementText(extracted.text) : parsePdfStatementText(extracted.text);

        // A PDF can be only partially readable: some pages/rows may have selectable text
        // while other rows need OCR. Retry when nothing was found OR when the parser reports
        // a material number of unrecognized lines. Keep whichever pass yields more usable
        // transactions; on ties, prefer the pass with fewer ignored lines. Never merge both
        // passes blindly because that would duplicate transactions.
        // A dated transaction line that did not become a parsed row is another signal
        // that text extraction may have lost columns/characters. Ignore Cora's daily date
        // headings here because its dedicated parser intentionally groups several lines
        // under one date and may include days without transactions.
        const datedLineCount = extracted.text.split(/\r?\n/).filter((line) =>
          /^\s*(?:\d{2}[/. -]\d{2}[/. -]\d{4}|\d{4}-\d{2}-\d{2})(?:\s|$)/.test(line)
        ).length;
        const hasUnparsedDatedLines = !isCora && datedLineCount > parsed.rows.length;
        const needsOcrRetry = parsed.rows.length === 0 ||
          (parsed.ignored > 0 && parsed.ignored >= Math.max(2, Math.ceil(parsed.rows.length * 0.5))) ||
          hasUnparsedDatedLines;
        if (needsOcrRetry) {
          const ocrRetry = await extractPdfText(f, true);
          const retryIsCora = /Cora\s+SCFI|37\.880\.206\/0001-63/i.test(ocrRetry.text);
          const retryParsed = retryIsCora ? parseCoraStatementText(ocrRetry.text) : parsePdfStatementText(ocrRetry.text);
          const retryIsBetter = retryParsed.rows.length > parsed.rows.length ||
            (retryParsed.rows.length === parsed.rows.length && retryParsed.ignored < parsed.ignored);
          if (retryIsBetter) {
            extracted = ocrRetry;
            isCora = retryIsCora;
            parsed = retryParsed;
          } else if (ocrRetry.ocrPages > 0) {
            // Keep the original text pass if it produced a better result, but tell the user
            // that OCR was attempted and the preview still requires careful review.
            extracted = { ...extracted, ocrPages: ocrRetry.ocrPages };
          }
        }

        const pdfParseError = isCora ? undefined : (parsed as ReturnType<typeof parsePdfStatementText>).headerError;
        if (!parsed.rows.length) throw new Error(pdfParseError || "Não foram encontradas linhas de lançamentos reconhecíveis no PDF, mesmo após tentar OCR. Confira se o arquivo está legível ou exporte o extrato em OFX/CSV.");
        const previewRows = isCora ? parsed.rows.map((row) => { const company = businessName || row.raw.titular_conta || "Sua empresa"; const isIncome = row.value?.type === "income" || row.raw.tipo === "entrada"; const counterparty = isIncome ? row.raw.remetente : row.raw.destinatario; const sender = isIncome ? (counterparty || row.raw.remetente || "") : company; const recipient = isIncome ? company : (counterparty || row.raw.destinatario || ""); return { ...row, raw: { ...row.raw, titular_extrato: row.raw.titular_conta || "", titular_conta: company, remetente: sender, destinatario: recipient }, value: row.value ? { ...row.value, sender_name: sender.slice(0, 120), recipient_name: recipient.slice(0, 120) } : undefined }; }) : parsed.rows;
        setRows(previewRows);
        if (parsed.ignored) setFileWarning(`${parsed.ignored} linha(s) do documento não foram reconhecidas como lançamentos e serão ignoradas.`);
        if (extracted.ocrPages) setFileWarning((current) => `${current ? `${current} ` : ""}${extracted.ocrPages} página(s) precisaram de OCR. Confira cada valor com o PDF original.`);
        return;
      }
      throw new Error("Formato não suportado. Envie um dos formatos indicados na tela.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível ler o arquivo.";
      setFileErr(message);
      setRows(null);
      toast.error(message);
    } finally {
      setIsReading(false);
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
          <DialogDescription>Importe somente CSV, Excel (.xlsx), PDF ou OFX. PDFs digitalizados podem usar OCR. Confira a prévia antes de importar até {maxRows} linhas.</DialogDescription>
        </DialogHeader>
        {!rows ? (
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center hover:border-primary focus-within:border-primary">
              <Upload className="h-8 w-8 text-primary" />
              <span className="font-medium">{isReading ? "Lendo arquivo..." : "Escolher arquivo financeiro"}</span>
              <span className="text-xs text-muted-foreground">Formatos aceitos: CSV, XLSX, PDF e OFX. A leitura pode demorar em PDFs digitalizados. Confira tudo antes de gravar.</span>
              <input type="file" disabled={isReading} accept=".csv,.xlsx,.pdf,.ofx,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => { const selected = e.currentTarget.files?.[0]; e.currentTarget.value = ""; void onFile(selected); }} />
            </label>
            {isReading && <p className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm" role="status" aria-live="polite"><LoaderCircle className="h-4 w-4 animate-spin" />Lendo e interpretando o arquivo. PDFs digitalizados podem levar alguns minutos; não feche esta janela.</p>}
            {fileErr && <p className="flex items-center gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger" role="alert" aria-live="assertive"><AlertCircle className="h-4 w-4 shrink-0" />{fileErr}</p>}
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
                  <tr><th className="p-2">Linha</th><th className="p-2">Tipo</th><th className="p-2">Descrição</th><th className="p-2">Valor</th><th className="p-2">Data</th><th className="p-2">Quem enviou</th><th className="p-2">Quem recebeu</th><th className="p-2">Método / documento</th><th className="p-2">Situação</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.line} className={`border-t ${r.errors.length ? "bg-danger/5" : ""}`}>
                      <td className="p-2 num text-muted-foreground">{r.line}</td>
                      <td className="p-2">{r.value?.type === "income" ? "Entrada" : r.value?.type === "expense" ? "Saída" : r.raw.tipo || "—"}</td>
                      <td className="p-2">{r.raw.descricao || "—"}</td>
                      <td className={`p-2 num ${r.value?.type === "income" ? "text-success" : r.value?.type === "expense" ? "text-danger" : ""}`}>{r.value ? `${r.value.type === "income" ? "+" : "−"}${formatBRL(r.value.amount_cents)}` : r.raw.valor}</td>
                      <td className="p-2 num">{r.value ? formatDate(r.value.due_date) : r.raw.vencimento}</td>
                      <td className="p-2">{r.raw.remetente || "Não identificado"}</td>
                      <td className="p-2">{r.raw.destinatario || "Não identificado"}</td>
                      <td className="p-2">{[r.raw.metodo, r.raw.documento_contraparte].filter(Boolean).join(" · ") || "—"}</td>
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


async function extractPdfText(file: File, forceOcr = false): Promise<{ text: string; ocrPages: number }> {
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
      const positionedItems = content.items
        .filter((item): item is typeof item & { str: string; transform: number[]; width?: number } => "str" in item && "transform" in item)
        .map((item) => ({
          text: item.str.trim(),
          x: item.transform[4],
          y: Math.round(item.transform[5] / 2) * 2,
          width: typeof item.width === "number" ? item.width : item.str.length * 4,
        }))
        .filter((item) => item.text.length > 0)
        .sort((a, b) => b.y - a.y || a.x - b.x);
      const textLines: Array<{ y: number; items: typeof positionedItems }> = [];
      for (const item of positionedItems) {
        const previous = textLines[textLines.length - 1];
        if (previous && Math.abs(previous.y - item.y) <= 2) previous.items.push(item);
        else textLines.push({ y: item.y, items: [item] });
      }
      // Preserve visual columns. Flattening PDF fragments with spaces can confuse a transaction amount with the running balance.
      let text = textLines.map((line) => {
        let output = "";
        let previousEnd: number | null = null;
        for (const item of line.items) {
          const gap = previousEnd === null ? 0 : item.x - previousEnd;
          output += (output ? (gap >= 18 ? "\t" : " ") : "") + item.text;
          previousEnd = item.x + item.width;
        }
        return output;
      }).join("\n");
      const hasTransactionLikeLine = /(?:\d{2}[/. -]\d{2}[/. -]\d{4}|\d{4}-\d{2}-\d{2}).*(?:R\$\s*)?[+-]?\d[\d.,]*(?:\s*(?:CR|DB|C|D))?\s*$/im.test(text);
      if (forceOcr || text.replace(/\s/g, "").length < 30 || !hasTransactionLikeLine) {
        worker ??= await createWorker("por");
        const viewport = page.getViewport({ scale: 1.8 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("O navegador não conseguiu preparar a página do PDF para OCR.");
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        const recognized = await worker.recognize(canvas);
        const recognizedWords = (recognized.data as unknown as { words?: Array<{ text: string; confidence: number; bbox: { x0: number; x1: number; y0: number } }> }).words ?? [];
        const words = recognizedWords
          .filter((word) => word.text.trim() && word.confidence >= 20)
          .map((word) => ({
            text: word.text.trim(),
            x: word.bbox.x0,
            right: word.bbox.x1,
            y: Math.round(word.bbox.y0 / 8) * 8,
          }))
          .sort((a, b) => a.y - b.y || a.x - b.x);
        const ocrLines: Array<{ y: number; words: typeof words }> = [];
        for (const word of words) {
          const previous = ocrLines[ocrLines.length - 1];
          if (previous && Math.abs(previous.y - word.y) <= 8) previous.words.push(word);
          else ocrLines.push({ y: word.y, words: [word] });
        }
        text = ocrLines.length
          ? ocrLines.map((line) => {
              let output = "";
              let previousRight: number | null = null;
              for (const word of line.words) {
                const gap = previousRight === null ? 0 : word.x - previousRight;
                output += (output ? (gap >= 25 ? "\t" : " ") : "") + word.text;
                previousRight = word.right;
              }
              return output;
            }).join("\n")
          : recognized.data.text;
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
