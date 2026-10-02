import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertOctagon, AlertTriangle, CheckCircle2, Circle, Inbox, Pencil, RotateCcw, Send, ShieldAlert, ShieldCheck, ShieldQuestion, TrendingDown, TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { accessQuery, entriesQuery, parseDbError, profileQuery, todaySP } from "@/lib/app-data";
import { formatBRL, formatDate } from "@/lib/format";
import { sendNow } from "@/lib/reminders.functions";
import { useMarkPaid } from "@/components/contas/shared";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/_app/caixa")({
  head: () => ({ meta: [{ title: "Caixa — Caixa Crítico" }, { name: "robots", content: "noindex" }] }),
  component: CaixaPage,
});

type Projection = { today: string; current: number; series: { date: string; balance: number }[]; min_balance: number; min_date: string; cushion: number; status: "green" | "yellow" | "red" };
type Risk = { entry_id: string; description: string; counterparty_name: string | null; counterparty_email: string | null; amount_cents: number; due_date: string; level: "high" | "medium" | "low"; reason: string };

const projectionQuery = { queryKey: ["projection"], queryFn: async () => {
  const { data, error } = await supabase.rpc("cash_projection", { _days: 30 });
  if (error) throw error;
  return data as unknown as Projection;
} };

function CaixaPage() {
  const proj = useQuery(projectionQuery);
  const entries = useQuery(entriesQuery);
  const access = useQuery(accessQuery);

  if (proj.isLoading || entries.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-32 rounded-2xl" /><div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div><Skeleton className="h-64 rounded-2xl" /></div>;
  }
  if (proj.isError || entries.isError) {
    return (
      <div className="flex flex-col items-center rounded-2xl border bg-card p-10 text-center">
        <AlertTriangle className="h-8 w-8 text-danger" />
        <p className="mt-3">Não foi possível calcular sua projeção.</p>
        <Button variant="outline" className="mt-4 h-11 rounded-xl" onClick={() => { proj.refetch(); entries.refetch(); }}><RotateCcw className="mr-2 h-4 w-4" />Tentar novamente</Button>
      </div>
    );
  }
  const p = proj.data!;
  const hasEntries = (entries.data?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Caixa</h1>
      <Activation hasEntries={hasEntries} />
      {!hasEntries ? (
        <div className="flex flex-col items-center rounded-2xl border bg-card p-10 text-center shadow-[var(--shadow-soft)]">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-accent text-accent-foreground"><Inbox className="h-8 w-8" /></span>
          <h2 className="mt-4 text-lg font-semibold">Vamos ver se o seu caixa fecha?</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">Cadastre o que você tem a receber e a pagar nos próximos 30 dias.</p>
          <div className="mt-5 flex gap-2">
            <Button asChild className="h-11 rounded-xl"><Link to="/contas" search={{ novo: 1 }}>Cadastrar conta</Link></Button>
            <Button asChild variant="outline" className="h-11 rounded-xl"><Link to="/contas" search={{ importar: 1 }}>Importar CSV</Link></Button>
          </div>
          <div className="mt-8 w-full max-w-sm text-left"><BalanceCard current={p.current} /></div>
        </div>
      ) : (
        <>
          <Semaphore p={p} />
          <div className="grid gap-4 md:grid-cols-3">
            <BalanceCard current={p.current} />
            <ProjCard label="Saldo projetado em 15 dias" value={p.series[15]?.balance ?? p.current} current={p.current} />
            <ProjCard label="Saldo projetado em 30 dias" value={p.series[30]?.balance ?? p.current} current={p.current} />
          </div>
          <Chart p={p} />
          <Risks limit={access.data?.limits.top_risks ?? 5} canWrite={access.data?.can_write ?? true} />
        </>
      )}
    </div>
  );
}

function Semaphore({ p }: { p: Projection }) {
  const cfg = {
    red: { icon: AlertOctagon, title: "Risco: o caixa não fecha", cls: "bg-danger/10 text-danger border-danger/30", msg: `Seu caixa fica negativo em ${formatDate(p.min_date)} (${formatBRL(p.min_balance)}).` },
    yellow: { icon: AlertTriangle, title: "Atenção: caixa apertado", cls: "bg-warning/10 text-warning border-warning/30", msg: `O pior dia é ${formatDate(p.min_date)}, com ${formatBRL(p.min_balance)} — abaixo da sua reserva de ${formatBRL(p.cushion)}.` },
    green: { icon: CheckCircle2, title: "Tudo certo: o caixa fecha", cls: "bg-success/10 text-success border-success/30", msg: `Nos próximos 30 dias o menor saldo é ${formatBRL(p.min_balance)}, em ${formatDate(p.min_date)}.` },
  }[p.status];
  return (
    <section className={`flex items-start gap-4 rounded-2xl border p-5 md:p-6 ${cfg.cls}`} aria-live="polite">
      <cfg.icon className="h-10 w-10 shrink-0" aria-hidden="true" />
      <div>
        <h2 className="text-xl font-semibold md:text-2xl">{cfg.title}</h2>
        <p className="mt-1 text-foreground">{cfg.msg}</p>
      </div>
    </section>
  );
}

function BalanceCard({ current }: { current: number }) {
  const qc = useQueryClient();
  const profile = useQuery(profileQuery);
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(current);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("profiles").update({ initial_balance_cents: v, balance_date: todaySP() }).eq("user_id", profile.data!.user_id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projection"] }); qc.invalidateQueries({ queryKey: ["profile"] }); setEdit(false); toast.success("Saldo atualizado."); },
    onError: (e) => toast.error(parseDbError(e).message),
  });
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Saldo atual</p>
        {!edit && <Button variant="ghost" size="sm" className="h-10" onClick={() => { setV(current); setEdit(true); }}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button>}
      </div>
      {edit ? (
        <form className="mt-1" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <label htmlFor="bal" className="sr-only">Saldo atual</label>
          <MoneyInput id="bal" value={v} onChange={setV} allowNegative />
          <div className="mt-2 flex gap-2">
            <Button type="submit" size="sm" className="h-10 rounded-lg" disabled={save.isPending}>Salvar</Button>
            <Button type="button" size="sm" variant="ghost" className="h-10" onClick={() => setEdit(false)}>Cancelar</Button>
          </div>
        </form>
      ) : (
        <>
          <p className={`num mt-1 text-[2rem] font-bold leading-tight ${current < 0 ? "text-danger" : ""}`}>{formatBRL(current)}</p>
          {profile.data?.balance_date && <p className="text-xs text-muted-foreground">Atualizado em {formatDate(profile.data.balance_date)}</p>}
        </>
      )}
    </div>
  );
}

function ProjCard({ label, value, current }: { label: string; value: number; current: number }) {
  const diff = value - current;
  const up = diff >= 0;
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`num mt-1 text-[2rem] font-bold leading-tight ${value < 0 ? "text-danger" : ""}`}>{formatBRL(value)}</p>
      <p className={`mt-1 flex items-center gap-1 text-sm ${up ? "text-success" : "text-danger"}`}>
        {up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
        <span className="num">{up ? "+" : "−"}{formatBRL(Math.abs(diff))}</span> <span className="text-muted-foreground">vs. hoje</span>
      </p>
    </div>
  );
}

function Chart({ p }: { p: Projection }) {
  const data = p.series.map((s) => ({ d: formatDate(s.date).slice(0, 5), v: s.balance / 100 }));
  const min = Math.min(0, ...data.map((d) => d.v));
  const max = Math.max(0, ...data.map((d) => d.v));
  const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", style: "currency", currency: "BRL" }).format(n);
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
      <h2 className="font-semibold">Saldo projetado — próximos 30 dias</h2>
      <div className="mt-4 h-64" role="img" aria-label={`Gráfico do saldo projetado. Menor saldo ${formatBRL(p.min_balance)} em ${formatDate(p.min_date)}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="d" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval={4} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={70} tickLine={false} axisLine={false} domain={[min * 1.1, max * 1.1]} />
            {min < 0 && <ReferenceArea y1={min * 1.1} y2={0} fill="var(--danger)" fillOpacity={0.08} />}
            <ReferenceLine y={0} stroke="var(--danger)" strokeWidth={1.5} strokeDasharray="4 4" />
            <Tooltip formatter={(v: number) => [formatBRL(Math.round(v * 100)), "Saldo"]} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)", color: "var(--popover-foreground)" }} />
            <Line type="monotone" dataKey="v" stroke="var(--primary)" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Risks({ limit, canWrite }: { limit: number; canWrite: boolean }) {
  const risks = useQuery({ queryKey: ["risks", limit], queryFn: async () => {
    const { data, error } = await supabase.rpc("top_risks", { _limit: limit });
    if (error) throw error;
    return data as Risk[];
  } });
  const markPaid = useMarkPaid();
  const send = useServerFn(sendNow);
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<Risk | null>(null);
  const charge = useMutation({
    mutationFn: (r: Risk) => send({ data: { entryId: r.entry_id } }),
    onSuccess: (r) => { r.ok ? toast.success(r.message) : toast.error(r.message); qc.invalidateQueries({ queryKey: ["usage"] }); },
    onError: () => toast.error("Sem conexão. Tente novamente."),
  });
  const badge = {
    high: { icon: ShieldAlert, label: "Alto", cls: "bg-danger/10 text-danger" },
    medium: { icon: ShieldQuestion, label: "Médio", cls: "bg-warning/10 text-warning" },
    low: { icon: ShieldCheck, label: "Baixo", cls: "bg-success/10 text-success" },
  };
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
      <h2 className="font-semibold">Maiores riscos de inadimplência</h2>
      {risks.isLoading ? <div className="mt-4 space-y-2"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /></div>
        : risks.isError ? <div className="mt-4 text-sm text-danger">Erro ao carregar riscos. <button className="underline" onClick={() => risks.refetch()}>Tentar novamente</button></div>
        : !risks.data?.length ? <p className="mt-4 text-sm text-muted-foreground">Nenhuma conta a receber pendente nos próximos 30 dias.</p>
        : (
          <ul className="mt-4 divide-y">
            {risks.data.map((r) => {
              const b = badge[r.level];
              return (
                <li key={r.entry_id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${b.cls}`}><b.icon className="h-3.5 w-3.5" />{b.label}</span>
                      <span className="font-medium">{r.counterparty_name || r.description}</span>
                      <span className="num font-semibold text-success">+{formatBRL(r.amount_cents)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{r.reason} Venc. {formatDate(r.due_date)}.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-10 rounded-lg" disabled={!canWrite || !r.counterparty_email || charge.isPending} onClick={() => setConfirm(r)}><Send className="mr-1 h-4 w-4" />Cobrar agora</Button>
                    <Button size="sm" variant="ghost" className="h-10 rounded-lg text-success" disabled={!canWrite} onClick={() => markPaid.mutate({ id: r.entry_id, paid: true })}><CheckCircle2 className="mr-1 h-4 w-4" />Pago</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar cobrança agora?</AlertDialogTitle>
            <AlertDialogDescription>Um e-mail será enviado para {confirm?.counterparty_email} sobre “{confirm?.description}”. Limite de 1 envio manual por conta a cada 24h.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="h-11 rounded-xl" onClick={() => confirm && charge.mutate(confirm)}>Enviar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Activation({ hasEntries }: { hasEntries: boolean }) {
  const q = useQuery({ queryKey: ["activation"], queryFn: async () => {
    const [{ count: rules }, { count: tests }] = await Promise.all([
      supabase.from("reminder_rules").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("action", "test_email"),
    ]);
    return { rules: (rules ?? 0) > 0, test: (tests ?? 0) > 0 };
  } });
  if (!q.data) return null;
  const steps = [
    { done: hasEntries, label: "Cadastre sua primeira conta", to: "/contas" as const },
    { done: q.data.rules, label: "Ative a régua de cobrança", to: "/lembretes" as const },
    { done: q.data.test, label: "Envie um e-mail de teste", to: "/lembretes" as const },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-sm font-semibold">Primeiros passos · {steps.filter((s) => s.done).length}/3</h2>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Link to={s.to} className="flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-accent">
              {s.done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
              <span className={s.done ? "text-muted-foreground line-through" : ""}>{i + 1}. {s.label}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
