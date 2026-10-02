import { useEffect, useRef } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { addDays, parseDbError, todaySP, type Entry, type LimitKind } from "@/lib/app-data";
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
    counterparty_email: z.string().trim().max(255).email("E-mail inválido.").or(z.literal("")),
    counterparty_whatsapp: z.string().trim().max(25).refine((v) => !v || toE164(v), "WhatsApp inválido. Use DDD + número."),
  })
  .refine((d) => d.type === "expense" || d.counterparty_whatsapp, { message: "WhatsApp obrigatório para contas a receber.", path: ["counterparty_whatsapp"] });
type FormV = z.infer<typeof schema>;

const LAST_TYPE = "cc:lastType";

export function EntryFormDialog({ open, onOpenChange, entry, onLimit }: {
  open: boolean; onOpenChange: (o: boolean) => void; entry?: Entry | null; onLimit: (k: LimitKind, msg: string) => void;
}) {
  const qc = useQueryClient();
  const addAnother = useRef(false);
  const blank = (): FormV => ({
    type: (typeof window !== "undefined" && (localStorage.getItem(LAST_TYPE) as "income" | "expense")) || "income",
    description: "", amount_cents: 0, due_date: todaySP(), counterparty_name: "", counterparty_email: "", counterparty_whatsapp: "",
  });
  const form = useForm<FormV>({ resolver: zodResolver(schema), defaultValues: blank() });
  const { register, handleSubmit, control, formState, watch, setValue, reset, setFocus } = form;

  useEffect(() => {
    if (!open) return;
    reset(entry ? {
      type: entry.type, description: entry.description, amount_cents: entry.amount_cents, due_date: entry.due_date,
      counterparty_name: entry.counterparty_name ?? "", counterparty_email: entry.counterparty_email ?? "", counterparty_whatsapp: entry.counterparty_whatsapp ?? "",
    } : blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry]);

  const save = useMutation({
    mutationFn: async (v: FormV) => {
      const payload = { ...v, counterparty_email: v.counterparty_email.toLowerCase() || null, counterparty_name: v.counterparty_name || null, counterparty_whatsapp: toE164(v.counterparty_whatsapp) };
      const { error } = entry
        ? await supabase.from("entries").update(payload).eq("id", entry.id)
        : await supabase.from("entries").insert(payload);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      localStorage.setItem(LAST_TYPE, v.type);
      qc.invalidateQueries({ queryKey: ["entries"] });
      qc.invalidateQueries({ queryKey: ["projection"] });
      toast.success(entry ? "Conta atualizada." : "Conta salva.");
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
            <Label htmlFor="cp_name">{type === "income" ? "Nome do cliente" : "Nome do fornecedor"}</Label>
            <Input id="cp_name" className="mt-1.5 h-11 rounded-xl" {...register("counterparty_name")} />
          </div>
          <div>
            <Label htmlFor="cp_wa">WhatsApp {type === "income" ? "do cliente" : "(opcional)"}</Label>
            <Input id="cp_wa" type="tel" inputMode="tel" placeholder="(11) 98765-4321" autoComplete="tel" className="mt-1.5 h-11 rounded-xl" {...register("counterparty_whatsapp")} />
            <p className="mt-1 text-xs text-muted-foreground">As cobranças automáticas são enviadas para este número.</p>
            <FieldError msg={formState.errors.counterparty_whatsapp?.message} />
          </div>
          <div>
            <Label htmlFor="cp_email">E-mail (opcional)</Label>
            <Input id="cp_email" type="email" className="mt-1.5 h-11 rounded-xl" {...register("counterparty_email")} />
            <FieldError msg={formState.errors.counterparty_email?.message} />
          </div>
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
            {!entry && (
              <Button type="button" variant="outline" className="h-11 flex-1 rounded-xl" disabled={save.isPending} onClick={() => submit(true)}>
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
