import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Download, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { accessQuery, parseDbError, type LimitKind } from "@/lib/app-data";
import { CSV_TEMPLATE, parseCsv, type CsvRow } from "@/lib/csv";
import { formatBRL, formatDate } from "@/lib/format";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function CsvImportDialog({ open, onOpenChange, onLimit }: { open: boolean; onOpenChange: (o: boolean) => void; onLimit: (k: LimitKind, m: string) => void }) {
  const qc = useQueryClient();
  const { data: access } = useQuery(accessQuery);
  const [rows, setRows] = useState<CsvRow[] | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const valid = rows?.filter((r) => r.value) ?? [];
  const maxRows = access?.limits.csv_rows ?? 0;

  const close = (o: boolean) => { if (!o) { setRows(null); setFileErr(null); } onOpenChange(o); };

  const onFile = async (f?: File) => {
    if (!f) return;
    if (f.size > 2_000_000) return setFileErr("Arquivo muito grande (máx. 2 MB).");
    const { rows, headerError } = parseCsv(await f.text());
    if (headerError) { setFileErr(headerError); setRows(null); return; }
    setFileErr(null);
    setRows(rows);
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
      const { data, error } = await supabase.rpc("import_entries", { _rows: valid.map((r) => r.value!) });
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
          <DialogTitle>Importar planilha CSV</DialogTitle>
          <DialogDescription>Colunas: descricao, valor, vencimento, tipo (entrada|saida), nome, email. Até {maxRows} linhas no seu plano.</DialogDescription>
        </DialogHeader>
        {!rows ? (
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center hover:border-primary focus-within:border-primary">
              <Upload className="h-8 w-8 text-primary" />
              <span className="font-medium">Escolher arquivo .csv</span>
              <span className="text-xs text-muted-foreground">Datas DD/MM/AAAA ou AAAA-MM-DD · valores como 1.234,56</span>
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {fileErr && <p className="flex items-center gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger" role="alert"><AlertCircle className="h-4 w-4" />{fileErr}</p>}
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
