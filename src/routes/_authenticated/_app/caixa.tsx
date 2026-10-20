import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertOctagon, AlertTriangle, CalendarDays, CheckCircle2, Circle, Inbox, MessageCircle, Pencil, RotateCcw, ShieldAlert, ShieldCheck, ShieldQuestion, TrendingDown, TrendingUp, Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { accessQuery, entriesQuery, parseDbError, profileQuery, todaySP } from "@/lib/app-data";
import { formatBRL, formatDate } from "@/lib/format";
import { createWhatsAppUrl } from "@/lib/whatsapp-message";
import { useMarkPaid } from "@/components/contas/shared";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/_app/caixa")({
  head: () => ({ meta: [{ title: "Caixa — Critical Cash" }, { name: "description", content: "Confira a previsão do seu caixa para os próximos 30 dias." }, { property: "og:title", content: "Caixa — Critical Cash" }, { property: "og:description", content: "Confira a previsão do seu caixa para os próximos 30 dias." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: CaixaPage,
});

type Projection = { today: string; current: number; series: { date: string; balance: number }[]; min_balance: number; min_date: string; cushion: number; status: "green" | "yellow" | "red" };
type Risk = { entry_id: string; description: string; counterparty_name: string | null; counterparty_whatsapp: string | null; amount_cents: number; due_date: string; level: "high" | "medium" | "low"; reason: string };

const projectionQuery = { queryKey: ["projection"], queryFn: async () => {
  const { data, error } = await supabase.rpc("cash_projection", { _days: 30 });
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("O banco não retornou uma projeção válida.");
  const result = data as unknown as Projection;
  if (!Array.isArray(result.series)) throw new Error("A série do gráfico está inválida.");
  const moneyValues = [result.current, result.min_balance, result.cushion, ...result.series.map((point) => point.balance)];
  if (moneyValues.some((value) => !Number.isSafeInteger(value))) {
    throw new Error("Os valores ultrapassam o limite de cálculo exato. Revise e divida lançamentos muito altos antes de continuar.");
  }
  return result;
} };

function CaixaPage() {
  const proj = useQuery(projectionQuery);
  const entries = useQuery(entriesQuery);
  const access = useQuery(accessQuery);
  const profile = useQuery(profileQuery);
  const [periodStart, setPeriodStart] = useState(() => `${todaySP().slice(0, 7)}-01`);
  const [periodEnd, setPeriodEnd] = useState(() => todaySP());

  if (proj.isLoading || entries.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-32 rounded-2xl" /><div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-32 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div><Skeleton className="h-64 rounded-2xl" /></div>;
  }
  if (proj.isError || entries.isError) {
    return (
      <div className="flex flex-col items-center rounded-2xl border bg-card p-10 text-center">
        <AlertTriangle className="h-8 w-8 text-danger" />
        <p className="mt-3">Não foi possível calcular sua projeção.</p>
        {proj.error instanceof Error && <p className="mt-2 max-w-xl text-sm text-muted-foreground">{proj.error.message}</p>}
        <Button variant="outline" className="mt-4 h-11 rounded-xl" onClick={() => { proj.refetch(); entries.refetch(); }}><RotateCcw className="mr-2 h-4 w-4" />Tentar novamente</Button>
      </div>
    );
  }
  const p = proj.data;
  if (!p) return null;
  const hasEntries = (entries.data?.length ?? 0) > 0;
  const ledger = (() => {
    const all = entries.data ?? [];
    const balanceDate = profile.data?.balance_date ?? todaySP();
    const snapshot = profile.data?.initial_balance_cents ?? 0;
    const effectiveDate = (e: (typeof all)[number]) => (e.paid_at ?? e.due_date).slice(0, 10);
    const net = (e: (typeof all)[number]) => (e.type === "income" ? 1 : -1) * e.amount_cents;
    const paid = all.filter((e) => e.status === "paid");
    let opening = snapshot;
    if (balanceDate >= periodStart) {
      opening -= paid.filter((e) => effectiveDate(e) >= periodStart && effectiveDate(e) <= balanceDate).reduce((sum, e) => sum + net(e), 0);
    } else {
      opening += paid.filter((e) => effectiveDate(e) > balanceDate && effectiveDate(e) < periodStart).reduce((sum, e) => sum + net(e), 0);
    }
    const rows = all.filter((e) => effectiveDate(e) >= periodStart && effectiveDate(e) <= periodEnd)
      .slice().sort((a, b) => effectiveDate(a).localeCompare(effectiveDate(b)) || a.created_at.localeCompare(b.created_at));
    let actual = opening;
    let projected = opening;
    const detailed = rows.map((e) => {
      if (e.status === "paid") actual += net(e);
      projected += net(e);
      return { ...e, actual_balance: actual, projected_balance: projected };
    });
    return { opening, closing: actual, projectedClosing: projected, rows: detailed };
  })();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Painel financeiro</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Visão do caixa</h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">Antecipe movimentos e mantenha o controle dos próximos 30 dias.</p>
        </div>
        <span className="mb-1 inline-flex items-center gap-2 rounded-full border border-success/20 bg-success/5 px-3 py-2 text-xs font-semibold text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" /> Dados atualizados
        </span>
      </div>
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
          <div className="mt-8 w-full max-w-sm text-left"><BalanceCard current={p.current} canWrite={access.data?.can_write ?? false} /></div>
        </div>
      ) : (
        <>
          <Semaphore p={p} />
          <div className="grid gap-5 md:grid-cols-3">
            <BalanceCard current={p.current} canWrite={access.data?.can_write ?? false} />
            <ProjCard label="Saldo projetado em 15 dias" value={p.series[15]?.balance ?? p.current} current={p.current} />
            <ProjCard label="Saldo projetado em 30 dias" value={p.series[30]?.balance ?? p.current} current={p.current} />
          </div>
          <Chart p={p} />
          <section className="premium-surface space-y-4 rounded-2xl p-6 md:p-7">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Extrato de caixa</p><h2 className="mt-1 text-lg font-semibold">Saldo antes e depois de cada movimentação</h2><p className="mt-1 text-sm text-muted-foreground">O saldo efetivo muda apenas com movimentações marcadas como pagas. Contas pendentes são mostradas separadamente no saldo previsto.</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm"><span className="font-medium">Data inicial</span><Input type="date" value={periodStart} max={periodEnd} onChange={(e) => setPeriodStart(e.target.value)} className="h-11 rounded-xl" /></label>
              <label className="space-y-1 text-sm"><span className="font-medium">Data final</span><Input type="date" value={periodEnd} min={periodStart} onChange={(e) => setPeriodEnd(e.target.value)} className="h-11 rounded-xl" /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Saldo antes do período</p><p className="num mt-1 text-lg font-semibold">{formatBRL(ledger.opening)}</p></div>
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Movimentações no período</p><p className="mt-1 text-lg font-semibold">{ledger.rows.length}</p></div>
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Saldo efetivo após todas as movimentações pagas</p><p className="num mt-1 text-lg font-semibold">{formatBRL(ledger.closing)}</p></div><div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Saldo previsto ao final do período</p><p className="num mt-1 text-lg font-semibold">{formatBRL(ledger.projectedClosing)}</p></div>
            </div>
            <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="px-3 py-3">Data</th><th className="px-3 py-3">Movimentação</th><th className="px-3 py-3">Contraparte</th><th className="px-3 py-3">Situação</th><th className="px-3 py-3 text-right">Entrada</th><th className="px-3 py-3 text-right">Saída</th><th className="px-3 py-3 text-right">Saldo efetivo após movimentação</th><th className="px-3 py-3 text-right">Saldo previsto</th></tr></thead><tbody>
              <tr className="border-b bg-muted/30 font-medium"><td className="px-3 py-3" colSpan={6}>Saldo de abertura · antes da primeira movimentação</td><td className="num px-3 py-3 text-right">{formatBRL(ledger.opening)}</td><td className="num px-3 py-3 text-right">{formatBRL(ledger.opening)}</td></tr>
              {ledger.rows.map((e) => <tr key={e.id} className="border-b last:border-0"><td className="whitespace-nowrap px-3 py-3">{formatDate(e.status === "paid" ? (e.paid_at ?? e.due_date).slice(0, 10) : e.due_date)}</td><td className="px-3 py-3"><div className="font-medium">{e.description}</div><div className="text-xs text-muted-foreground">{e.type === "income" ? "Entrada" : "Saída"}</div></td><td className="px-3 py-3">{e.counterparty_name || "—"}</td><td className="px-3 py-3">{e.status === "paid" ? "Pago" : "Pendente · previsto"}</td><td className="num px-3 py-3 text-right">{e.type === "income" ? formatBRL(e.amount_cents) : "—"}</td><td className="num px-3 py-3 text-right">{e.type === "expense" ? formatBRL(e.amount_cents) : "—"}</td><td className="num px-3 py-3 text-right font-semibold">{formatBRL(e.actual_balance)}</td><td className="num px-3 py-3 text-right">{formatBRL(e.projected_balance)}</td></tr>)}
              {!ledger.rows.length && <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={8}>Nenhuma movimentação neste período.</td></tr>}
              <tr className="bg-muted/30 font-semibold"><td className="px-3 py-3" colSpan={6}>Saldo final efetivo (após todas as movimentações pagas)</td><td className="num px-3 py-3 text-right">{formatBRL(ledger.closing)}</td><td className="num px-3 py-3 text-right">{formatBRL(ledger.projectedClosing)}</td></tr>
            </tbody></table></div>
          </section>
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
    <section className={`cash-reveal flex items-start gap-4 rounded-2xl border p-6 shadow-[var(--shadow-soft)] md:p-7 ${cfg.cls}`} aria-live="polite">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-background/60 shadow-sm">
        <cfg.icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-xl font-semibold md:text-2xl">{cfg.title}</h2>
        <p className="mt-1 text-foreground">{cfg.msg}</p>
      </div>
    </section>
  );
}

function BalanceCard({ current, canWrite }: { current: number; canWrite: boolean }) {
  const qc = useQueryClient();
  const profile = useQuery(profileQuery);
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(current);
  useEffect(() => { if (!canWrite) setEdit(false); }, [canWrite]);
  const save = useMutation({
    mutationFn: async () => {
      if (!profile.data?.user_id) throw new Error("Perfil indisponível");
      const { error } = await supabase.from("profiles").update({ initial_balance_cents: v, balance_date: todaySP() }).eq("user_id", profile.data.user_id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projection"] }); qc.invalidateQueries({ queryKey: ["profile"] }); setEdit(false); toast.success("Saldo atualizado."); },
    onError: (e) => toast.error(parseDbError(e).message),
  });
  return (
    <div className="premium-surface rounded-2xl p-6 md:p-7">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Wallet className="h-5 w-5" /></span>
          <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saldo atual</p><p className="mt-0.5 text-xs text-muted-foreground">Posição de caixa</p></div>
        </div>
        {!edit && canWrite && <Button variant="ghost" size="sm" className="h-10 rounded-xl" onClick={() => { setV(current); setEdit(true); }}><Pencil className="mr-1 h-3.5 w-3.5" />Editar</Button>}
      </div>
      {edit && canWrite ? (
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
          <p className={`num mt-5 text-[2.25rem] font-bold leading-tight tracking-tight ${current < 0 ? "text-danger" : ""}`}>{formatBRL(current)}</p>
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
    <div className="premium-surface rounded-2xl p-6 md:p-7">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${up ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}><CalendarDays className="h-5 w-5" /></span>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className={`num mt-5 text-[2.25rem] font-bold leading-tight tracking-tight ${value < 0 ? "text-danger" : ""}`}>{formatBRL(value)}</p>
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
    <section className="premium-surface rounded-2xl p-6 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Projeção</p><h2 className="mt-1 text-lg font-semibold tracking-tight">Saldo nos próximos 30 dias</h2></div>
        <span className="rounded-full border border-border/80 bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">Atualização diária</span>
      </div>
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
    const { data, error } = await supabase.from("entries")
      .select("id, description, counterparty_name, counterparty_whatsapp, amount_cents, due_date")
      .eq("status", "pending")
      .order("due_date", { ascending: true })
      .limit(Math.max(limit, 1));
    if (error) throw error;
    const today = todaySP();
    return (data ?? []).map((entry): Risk => {
      const daysUntilDue = Math.floor((new Date(entry.due_date + "T12:00:00").getTime() - new Date(today + "T12:00:00").getTime()) / 86400000);
      const level: Risk["level"] = daysUntilDue < 0 ? "high" : daysUntilDue <= 3 ? "medium" : "low";
      const reason = daysUntilDue < 0 ? `Vencida há ${Math.abs(daysUntilDue)} dia(s).` : daysUntilDue === 0 ? "Vence hoje." : `Vence em ${daysUntilDue} dia(s).`;
      return { entry_id: entry.id, description: entry.description, counterparty_name: entry.counterparty_name, counterparty_whatsapp: entry.counterparty_whatsapp, amount_cents: entry.amount_cents, due_date: entry.due_date, level, reason };
    });
  } });
  const markPaid = useMarkPaid();
  const openWhatsApp = (risk: Risk) => {
    const url = createWhatsAppUrl({
      counterparty_name: risk.counterparty_name,
      counterparty_whatsapp: risk.counterparty_whatsapp,
      amount_cents: risk.amount_cents,
      due_date: risk.due_date,
      description: risk.description,
    }, `Olá, ${risk.counterparty_name || "cliente"}! Passando para lembrar que ${risk.description}, no valor de ${formatBRL(risk.amount_cents)}, vence em ${formatDate(risk.due_date)}. ${risk.reason} Se já realizou o pagamento, desconsidere esta mensagem.`);
    if (!url) {
      toast.error("Cadastre um número de WhatsApp válido para esta conta.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const badge = {
    high: { icon: ShieldAlert, label: "Alto", cls: "bg-danger/10 text-danger" },
    medium: { icon: ShieldQuestion, label: "Médio", cls: "bg-warning/10 text-warning" },
    low: { icon: ShieldCheck, label: "Baixo", cls: "bg-success/10 text-success" },
  };
  return (
    <section className="premium-surface rounded-2xl p-6 md:p-7">
      <div className="flex items-center justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Acompanhamento</p><h2 className="mt-1 text-lg font-semibold tracking-tight">Contas que exigem atenção</h2></div><ShieldAlert className="h-5 w-5 text-warning" /></div>
      {risks.isLoading ? <div className="mt-4 space-y-2"><Skeleton className="h-16 rounded-xl" /><Skeleton className="h-16 rounded-xl" /></div>
        : risks.isError ? <div className="mt-4 text-sm text-danger">Erro ao carregar riscos. <button className="underline" onClick={() => risks.refetch()}>Tentar novamente</button></div>
        : !risks.data?.length ? <p className="mt-4 text-sm text-muted-foreground">Nenhuma conta a receber pendente nos próximos 30 dias.</p>
        : (
          <ul className="mt-5 divide-y divide-border/70">
            {risks.data.map((r) => {
              const b = badge[r.level];
              return (
                <li key={r.entry_id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${b.cls}`}><b.icon className="h-3.5 w-3.5" />{b.label}</span>
                      <span className="font-medium">{r.counterparty_name || r.description}</span>
                      <span className="num font-semibold text-success">+{formatBRL(r.amount_cents)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{r.reason} Venc. {formatDate(r.due_date)}.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-10 rounded-lg" disabled={!canWrite || !r.counterparty_whatsapp} onClick={() => openWhatsApp(r)}><MessageCircle className="mr-1 h-4 w-4" />Enviar via WhatsApp</Button>
                    <Button size="sm" variant="ghost" className="h-10 rounded-lg text-success" disabled={!canWrite} onClick={() => markPaid.mutate({ id: r.entry_id, paid: true })}><CheckCircle2 className="mr-1 h-4 w-4" />Pago</Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}

function Activation({ hasEntries }: { hasEntries: boolean }) {
  const q = useQuery({ queryKey: ["activation"], queryFn: async () => {
    const { count: rules } = await supabase.from("reminder_rules").select("id", { count: "exact", head: true }).eq("active", true);
    return { rules: (rules ?? 0) > 0 };
  } });
  if (!q.data) return null;
  const steps = [
    { done: hasEntries, label: "Cadastre sua primeira conta", to: "/contas" as const },
    { done: q.data.rules, label: "Prepare suas mensagens de cobrança", to: "/lembretes" as const },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="text-sm font-semibold">Primeiros passos · {steps.filter((s) => s.done).length}/2</h2>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
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
