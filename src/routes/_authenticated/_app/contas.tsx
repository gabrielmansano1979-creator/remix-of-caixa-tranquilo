import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertTriangle, BellOff, Bell, CheckCircle2, Clock, FileUp, MoreVertical, Pencil, Plus, Search, Trash2, Inbox, RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { accessQuery, entriesQuery, isOverdue, parseDbError, todaySP, type Entry, type LimitKind } from "@/lib/app-data";
import { formatBRL, formatDate } from "@/lib/format";
import { USAGE_WARNING_RATIO } from "@/config/plans";
import { StatusBadge, useMarkPaid } from "@/components/contas/shared";
import { EntryFormDialog } from "@/components/contas/entry-form";
import { CsvImportDialog } from "@/components/contas/csv-import";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/_app/contas")({
  validateSearch: z.object({ novo: z.number().optional(), importar: z.number().optional() }),
  head: () => ({ meta: [{ title: "Contas — Caixa Crítico" }, { name: "robots", content: "noindex" }] }),
  component: ContasPage,
});

type Status = "all" | "pending" | "paid" | "overdue";

function ContasPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/contas" });
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery(entriesQuery);
  const { data: access } = useQuery(accessQuery);
  const [tab, setTab] = useState<"all" | "income" | "expense">("all");
  const [status, setStatus] = useState<Status>("all");
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [del, setDel] = useState<Entry | null>(null);
  const [detail, setDetail] = useState<Entry | null>(null);
  const [limit, setLimit] = useState<string | null>(null);
  const markPaid = useMarkPaid();
  const canWrite = access?.can_write ?? true;

  useEffect(() => {
    if (search.novo) setFormOpen(true);
    if (search.importar) setCsvOpen(true);
    if (search.novo || search.importar) navigate({ search: {}, replace: true });
  }, [search.novo, search.importar, navigate]);

  const onLimit = (_k: LimitKind, msg: string) => setLimit(msg);
  const guard = (fn: () => void) => () => (canWrite ? fn() : setLimit("Seu teste grátis terminou e a conta está em modo somente leitura."));

  const pendingCount = data?.filter((e) => e.status === "pending").length ?? 0;
  const pendingLimit = access?.limits.pending_entries ?? Infinity;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data ?? []).filter((e) =>
      (tab === "all" || e.type === tab) &&
      (status === "all" || (status === "overdue" ? isOverdue(e) : status === "pending" ? e.status === "pending" && !isOverdue(e) : e.status === "paid")) &&
      (!term || (e.counterparty_name ?? "").toLowerCase().includes(term) || e.description.toLowerCase().includes(term)));
  }, [data, tab, status, q]);

  const mute = useMutation({
    mutationFn: async (e: Entry) => {
      const { error } = await supabase.from("entries").update({ reminders_muted: !e.reminders_muted }).eq("id", e.id);
      if (error) throw error;
    },
    onSuccess: (_d, e) => { qc.invalidateQueries({ queryKey: ["entries"] }); toast.success(e.reminders_muted ? "Lembretes reativados." : "Lembretes pausados para esta conta."); },
    onError: (e) => toast.error(parseDbError(e).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["entries"] }); qc.invalidateQueries({ queryKey: ["projection"] }); toast.success("Conta excluída."); },
    onError: (e) => toast.error(parseDbError(e).message),
  });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contas</h1>
          <p className="text-sm text-muted-foreground">O que você tem a receber e a pagar.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-11 rounded-xl" onClick={guard(() => setCsvOpen(true))}><FileUp className="mr-2 h-4 w-4" />Importar CSV</Button>
          <Button className="h-11 rounded-xl" onClick={guard(() => { setEditing(null); setFormOpen(true); })}><Plus className="mr-2 h-4 w-4" />Nova conta</Button>
        </div>
      </div>

      {access && pendingCount >= pendingLimit * USAGE_WARNING_RATIO && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-warning/10 p-3 text-sm text-warning" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Você está usando {pendingCount} de {pendingLimit} contas pendentes do seu plano.
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="h-11 rounded-xl">
            <TabsTrigger value="all" className="h-9 rounded-lg">Todas</TabsTrigger>
            <TabsTrigger value="income" className="h-9 rounded-lg">A receber</TabsTrigger>
            <TabsTrigger value="expense" className="h-9 rounded-lg">A pagar</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-1 gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
            <SelectTrigger className="h-11 w-40 rounded-xl" aria-label="Filtrar por status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="overdue">Atrasado</SelectItem>
              <SelectItem value="paid">Pago</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Buscar por nome" placeholder="Buscar por nome…" value={q} onChange={(e) => setQ(e.target.value)} className="h-11 rounded-xl pl-9" />
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-card shadow-[var(--shadow-soft)]">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
        ) : isError ? (
          <div className="flex flex-col items-center p-10 text-center">
            <AlertTriangle className="h-8 w-8 text-danger" />
            <p className="mt-3 text-sm">Não foi possível carregar suas contas.</p>
            <Button variant="outline" className="mt-4 h-11 rounded-xl" onClick={() => refetch()}><RotateCcw className="mr-2 h-4 w-4" />Tentar novamente</Button>
          </div>
        ) : !data?.length ? (
          <div className="flex flex-col items-center p-10 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-accent text-accent-foreground"><Inbox className="h-8 w-8" /></span>
            <h2 className="mt-4 font-semibold">Nenhuma conta ainda</h2>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">Cadastre o que você tem a receber e a pagar para ver se o caixa fecha.</p>
            <div className="mt-5 flex gap-2">
              <Button className="h-11 rounded-xl" onClick={guard(() => setFormOpen(true))}>Cadastrar conta</Button>
              <Button variant="outline" className="h-11 rounded-xl" onClick={guard(() => setCsvOpen(true))}>Importar CSV</Button>
            </div>
          </div>
        ) : !rows.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Nenhuma conta encontrada com esses filtros.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="hidden text-left text-xs text-muted-foreground md:table-header-group">
              <tr className="border-b"><th className="p-3 font-medium">Vencimento</th><th className="p-3 font-medium">Nome</th><th className="p-3 font-medium">Descrição</th><th className="p-3 text-right font-medium">Valor</th><th className="p-3 font-medium">Status</th><th className="w-24 p-3" /></tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="grid grid-cols-[1fr_auto] gap-x-3 border-b p-3 last:border-0 md:table-row md:p-0">
                  <td className="num text-xs text-muted-foreground md:p-3 md:text-sm md:text-foreground">{formatDate(e.due_date)}</td>
                  <td className="col-start-1 font-medium md:p-3">
                    <button className="text-left hover:underline" onClick={() => setDetail(e)}>{e.counterparty_name || "—"}</button>
                    {e.reminders_muted && <BellOff className="ml-1 inline h-3.5 w-3.5 text-muted-foreground" aria-label="Lembretes pausados" />}
                  </td>
                  <td className="col-start-1 text-muted-foreground md:p-3">{e.description}</td>
                  <td className={`num col-start-2 row-span-2 row-start-1 self-center text-right font-semibold md:p-3 ${e.type === "income" ? "text-success" : "text-danger"}`}>
                    {e.type === "income" ? "+" : "−"}{formatBRL(e.amount_cents)}
                  </td>
                  <td className="col-start-1 md:p-3"><StatusBadge e={e} /></td>
                  <td className="col-start-2 row-start-3 flex items-center justify-end gap-1 md:p-3">
                    {e.status === "pending" && (
                      <Button size="sm" variant="ghost" className="h-10 rounded-lg text-success" onClick={guard(() => markPaid.mutate({ id: e.id, paid: true }))} aria-label="Marcar como pago">
                        <CheckCircle2 className="h-4 w-4 md:mr-1" /><span className="hidden lg:inline">Pago</span>
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-10 w-10" aria-label="Ações"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="rounded-xl">
                        <DropdownMenuItem onClick={() => setDetail(e)}>Ver detalhes</DropdownMenuItem>
                        <DropdownMenuItem onClick={guard(() => { setEditing(e); setFormOpen(true); })}><Pencil className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                        {e.status === "paid" && <DropdownMenuItem onClick={guard(() => markPaid.mutate({ id: e.id, paid: false }))}><RotateCcw className="mr-2 h-4 w-4" />Reabrir</DropdownMenuItem>}
                        {e.type === "income" && (
                          <DropdownMenuItem onClick={guard(() => mute.mutate(e))}>
                            {e.reminders_muted ? <><Bell className="mr-2 h-4 w-4" />Reativar lembretes</> : <><BellOff className="mr-2 h-4 w-4" />Pausar lembretes</>}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-danger" onClick={guard(() => setDel(e))}><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <EntryFormDialog open={formOpen} onOpenChange={setFormOpen} entry={editing} onLimit={onLimit} />
      <CsvImportDialog open={csvOpen} onOpenChange={setCsvOpen} onLimit={onLimit} />
      <UpgradeDialog open={!!limit} onOpenChange={(o) => !o && setLimit(null)} message={limit ?? ""} />
      <EntryDetail entry={detail} onClose={() => setDetail(null)} />

      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta conta?</AlertDialogTitle>
            <AlertDialogDescription>“{del?.description}” será removida e os lembretes dela param. Não dá para desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="h-11 rounded-xl bg-danger text-danger-foreground hover:bg-danger/90" onClick={() => del && remove.mutate(del.id)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EntryDetail({ entry, onClose }: { entry: Entry | null; onClose: () => void }) {
  const logs = useQuery({
    queryKey: ["logs", entry?.id],
    enabled: !!entry,
    queryFn: async () => {
      const { data, error } = await supabase.from("reminder_logs").select("id, status, sent_to, sent_at, error, reminder_rules(label)").eq("entry_id", entry!.id).order("sent_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  return (
    <Sheet open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {entry && (
          <>
            <SheetHeader><SheetTitle>{entry.description}</SheetTitle></SheetHeader>
            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-muted-foreground">Valor</dt><dd className={`num text-lg font-semibold ${entry.type === "income" ? "text-success" : "text-danger"}`}>{entry.type === "income" ? "+" : "−"}{formatBRL(entry.amount_cents)}</dd></div>
              <div><dt className="text-muted-foreground">Status</dt><dd><StatusBadge e={entry} /></dd></div>
              <div><dt className="text-muted-foreground">Vencimento</dt><dd className="num">{formatDate(entry.due_date)}</dd></div>
              <div><dt className="text-muted-foreground">Pago em</dt><dd className="num">{entry.paid_at ? formatDate(entry.paid_at) : "—"}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">{entry.type === "income" ? "Cliente" : "Fornecedor"}</dt><dd>{entry.counterparty_name || "—"} {entry.counterparty_email && <span className="text-muted-foreground">· {entry.counterparty_email}</span>}</dd></div>
            </dl>
            {entry.type === "income" && (
              <div className="mt-8">
                <h3 className="font-semibold">Histórico de lembretes</h3>
                {logs.isLoading ? <Skeleton className="mt-3 h-16 rounded-xl" /> : logs.isError ? (
                  <p className="mt-3 text-sm text-danger">Erro ao carregar histórico.</p>
                ) : !logs.data?.length ? (
                  <p className="mt-3 text-sm text-muted-foreground">Nenhum lembrete enviado ainda{entry.reminders_muted ? " (lembretes pausados)" : ""}.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {logs.data.map((l) => (
                      <li key={l.id} className="flex items-start justify-between gap-3 rounded-xl border p-3 text-sm">
                        <div><p className="font-medium">{(l.reminder_rules as { label?: string } | null)?.label ?? "Cobrança manual"}</p><p className="text-xs text-muted-foreground">{new Date(l.sent_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p></div>
                        {l.status === "sent"
                          ? <span className="flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" />Enviado</span>
                          : <span className="flex items-center gap-1 text-danger"><AlertTriangle className="h-4 w-4" />{l.status === "bounced" ? "Devolvido" : "Falhou"}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
