import { useEffect, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight, FileText, Eye, Upload, X, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { addDays, parseDbError, profileQuery, todaySP, type Entry, type LimitKind } from "@/lib/app-data";
import { MoneyInput } from "@/components/money-input";
import { FieldError } from "@/components/auth-shell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toE164 } from "@/lib/phone";

const schema = z
  .object({
    type: z.enum(["income", "expense"]),
    description: z.string().trim().min(1, "Informe a descrição.").max(200),
    amount_cents: z.number().int().positive("Informe um valor maior que zero."),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe o vencimento."),
    counterparty_name: z.string().trim().max(120),
    counterparty_whatsapp: z.string().trim().max(25).refine((v) => !v || toE164(v), "WhatsApp inválido. Use DDD + número."),
    pix_url: z.string().trim().max(2000).url("Informe um link válido.").refine(v => v.startsWith("https://"), "Use um link https.").or(z.literal("")),
  }).superRefine((value, ctx) => {
    if (!value.counterparty_name.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["counterparty_name"], message: value.type === "income" ? "Informe quem pagou à empresa." : "Informe quem recebeu o pagamento." });
  });
type FormV = z.infer<typeof schema>;

const LAST_TYPE = "cc:lastType";

export function EntryFormDialog({ open, onOpenChange, entry, onLimit }: {
  open: boolean; onOpenChange: (o: boolean) => void; entry?: Entry | null; onLimit: (k: LimitKind, msg: string) => void;
}) {
  const qc = useQueryClient();
  const { data: profile } = useQuery(profileQuery);
  const addAnother = useRef(false);\n  const [receiptFile, setReceiptFile] = useState<File | null>(null);\n  const [existingReceiptPath, setExistingReceiptPath] = useState<string | null>(null);\n  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);\n  const [receiptPreviewType, setReceiptPreviewType] = useState<string | null>(null);\n  const [receiptLoading, setReceiptLoading] = useState(false);
  const blank = (): FormV => ({
    type: (typeof window !== "undefined" && (localStorage.getItem(LAST_TYPE) as "income" | "expense")) || "income",
    description: "", amount_cents: 0, due_date: todaySP(), counterparty_name: "", counterparty_whatsapp: "", pix_url: "",
  });
  const form = useForm<FormV>({ resolver: zodResolver(schema), defaultValues: blank() });
  const { register, handleSubmit, control, formState, watch, setValue, reset, setFocus } = form;

  useEffect(() => {
    if (!open) return;
    setReceiptFile(null);\n    setReceiptPreviewUrl(null);\n    setExistingReceiptPath((entry as (Entry & { receipt_path?: string | null }) | null | undefined)?.receipt_path ?? null);\n    reset(entry ? {
      type: entry.type, description: entry.description, amount_cents: entry.amount_cents, due_date: entry.due_date,
      counterparty_name: entry.counterparty_name ?? "", counterparty_whatsapp: entry.counterparty_whatsapp ?? "",
      pix_url: entry.pix_url ?? "",
    } : blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry]);

  const save = useMutation({
    mutationFn: async (v: FormV) => {
      const payload = { ...v, pix_url: v.pix_url || null, counterparty_name: v.counterparty_name || null, counterparty_whatsapp: toE164(v.counterparty_whatsapp) };
      const { error } = entry
        ? await supabase.from("entries").update(payload).eq("id", entry.id)
        : await supabase.from("entries").insert(payload);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      localStorage.setItem(LAST_TYPE, v.type);
      qc.invalidateQueries({ queryKey: ["entries"] });
      qc.invalidateQueries({ queryKey: ["projection"] });
      setReceiptFile(null);\n      setReceiptPreviewUrl(null);\n      toast.success(entry ? "Conta atualizada." : "Conta salva.");
      if (addAnother.current && !entry) {
        reset({ ...blank(), type: v.type });
        setTimeout(() => setFocus("description"), 0);
      } else onOpenChange(false);
    },
    onError: (e) => {
      const p = parseDbError(e);
      if (p.kind) { onOpenChange(false); onLimit(p.kind, p.message); } else toast.error(p.message);
    },
  });

  const type = watch("type");
  const due = watch("due_date");
  const submit = (another: boolean) => { addAnother.current = another; return handleSubmit((v) => save.mutate(v))(); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-md">
        <DialogHeader><DialogTitle>{entry ? "Editar conta" : "Nova conta"}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); submit(false); }} noValidate className="space-y-4">
          <div role="radiogroup" aria-label="Tipo" className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
            {([["income", "Entrada", ArrowDownLeft], ["expense", "Saída", ArrowUpRight]] as const).map(([v, l, Icon]) => (
              <button key={v} type="button" role="radio" aria-checked={type === v} onClick={() => setValue("type", v)}
                className={`flex h-11 items-center justify-center gap-2 rounded-lg text-sm font-medium ${type === v ? "bg-card shadow-sm " + (v === "income" ? "text-success" : "text-danger") : "text-muted-foreground"}`}>
                <Icon className="h-4 w-4" />{l}
              </button>
            ))}
          </div>
          <div>
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" className="mt-1.5 h-11 rounded-xl" {...register("description")} />
            <FieldError msg={formState.errors.description?.message} />
          </div>
          <div>
            <Label htmlFor="amount">Valor</Label>
            <Controller control={control} name="amount_cents" render={({ field }) => <MoneyInput id="amount" value={field.value} onChange={field.onChange} />} />
            <FieldError msg={formState.errors.amount_cents?.message} />
          </div>
          <div>
            <Label htmlFor="due_date">Vencimento</Label>
            <Input id="due_date" type="date" className="mt-1.5 h-11 rounded-xl" {...register("due_date")} />
            <div className="mt-2 flex gap-2">
              {[["Hoje", 0], ["+7 dias", 7], ["+30 dias", 30]].map(([l, n]) => {
                const v = addDays(todaySP(), n as number);
                return (
                  <button key={l} type="button" onClick={() => setValue("due_date", v)}
                    className={`h-9 rounded-full border px-3 text-xs font-medium ${due === v ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground"}`}>{l}</button>
                );
              })}
            </div>
            <FieldError msg={formState.errors.due_date?.message} />
          </div>
          <div>
            <Label htmlFor="cp_name">{type === "income" ? "Quem pagou à empresa?" : "Quem recebeu o pagamento?"} *</Label>
            <Input id="cp_name" required maxLength={120} placeholder={type === "income" ? "Nome da pessoa ou empresa pagadora" : "Nome da pessoa ou empresa beneficiária"} className="mt-1.5 h-11 rounded-xl" {...register("counterparty_name")} />
            <FieldError msg={formState.errors.counterparty_name?.message} />
            <p className="mt-1 text-xs text-muted-foreground">{type === "income" ? "Empresa que recebe: " : "Empresa que paga: "}<span className="font-medium text-foreground">{profile?.business_name?.trim() || "Cadastre o nome da sua empresa no perfil"}</span></p>
          </div>
          <div>
            <Label htmlFor="cp_wa">WhatsApp {type === "income" ? "do cliente" : "(opcional)"}</Label>
            <Input id="cp_wa" type="tel" inputMode="tel" placeholder="(11) 98765-4321" autoComplete="tel" className="mt-1.5 h-11 rounded-xl" {...register("counterparty_whatsapp")} />
            <p className="mt-1 text-xs text-muted-foreground">Preencha para enviar lembretes pelo WhatsApp.</p>
            <FieldError msg={formState.errors.counterparty_whatsapp?.message} />
          </div>
          <div><Label htmlFor="pix_url">Link Pix do cliente (opcional)</Label><Input id="pix_url" type="url" maxLength={2000} className="mt-1.5 h-11" {...register("pix_url")} /><FieldError msg={formState.errors.pix_url?.message} /></div>
          <div className="space-y-2 rounded-xl border border-dashed p-3">\n            <div className="flex items-start gap-2"><FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><Label htmlFor="receipt-file" className="cursor-pointer">Comprovante da movimentação</Label><p className="mt-1 text-xs text-muted-foreground">Anexe o comprovante de pagamento ou recebimento para a conferência automática. PDF, JPG, PNG ou WEBP; até 10 MB.</p></div></div>\n            <label htmlFor="receipt-file" className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-accent"><Upload className="h-4 w-4" />{receiptFile ? "Trocar comprovante" : existingReceiptPath ? "Substituir comprovante" : "Escolher comprovante"}<input id="receipt-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 10 * 1024 * 1024) { toast.error("O comprovante deve ter no máximo 10 MB."); event.currentTarget.value = ""; return; } if (!["application/pdf","image/jpeg","image/png","image/webp"].includes(file.type)) { toast.error("Formato não permitido. Use PDF, JPG, PNG ou WEBP."); event.currentTarget.value = ""; return; } setReceiptFile(file); setReceiptPreviewType(file.type); setReceiptPreviewUrl(URL.createObjectURL(file)); }} /></label>\n            {receiptFile && <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 p-2 text-xs"><span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0" /><span className="truncate">{receiptFile.name}</span></span><button type="button" className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Remover comprovante selecionado" onClick={() => { setReceiptFile(null); if (receiptPreviewUrl) URL.revokeObjectURL(receiptPreviewUrl); setReceiptPreviewUrl(null); }}><X className="h-4 w-4" /></button></div>}\n            {existingReceiptPath && !receiptFile && <p className="text-xs text-emerald-700">Já existe um comprovante anexado. Selecione outro arquivo para substituí-lo.</p>}\n            {receiptPreviewUrl && <div className="overflow-hidden rounded-lg border"><div className="flex items-center justify-between border-b px-3 py-2 text-xs font-medium"><span>Pré-visualização do comprovante</span><a href={receiptPreviewUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary"><Eye className="h-3.5 w-3.5" />Abrir</a></div>{receiptPreviewType === "application/pdf" ? <iframe title="Pré-visualização do comprovante PDF" src={receiptPreviewUrl} className="h-64 w-full" /> : <img src={receiptPreviewUrl} alt="Pré-visualização do comprovante" className="max-h-64 w-full object-contain" />}</div>}\n            <p role="status" className="flex items-start gap-1.5 text-xs text-amber-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Após anexar, o sistema precisa conferir o documento e o valor. O arquivo sozinho não aprova a movimentação; enquanto a conferência não terminar, ela fica pendente.</p>\n          </div>\n          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
            {!entry && (
              <Button type="button" variant="outline" className="h-11 flex-1 rounded-xl" disabled={save.isPending || receiptLoading} onClick={() => submit(true)}>
                Salvar e adicionar outra
              </Button>
            )}
            <Button type="submit" className="h-11 flex-1 rounded-xl" disabled={save.isPending}>Salvar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
