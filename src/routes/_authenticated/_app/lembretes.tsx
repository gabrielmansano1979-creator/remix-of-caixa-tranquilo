import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Lock, Mail, RotateCcw, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseDbError } from "@/lib/app-data";
import { useEntitlements } from "@/hooks/use-entitlements";
import { sendTest } from "@/lib/reminders.functions";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/_app/lembretes")({
  head: () => ({ meta: [{ title: "Lembretes — Critical Cash" }, { name: "robots", content: "noindex" }] }),
  component: LembretesPage,
});

type Rule = { id: string; label: string; offset_days: number; subject_tpl: string; body_tpl: string; active: boolean };
const VARS = ["cliente", "valor", "vencimento", "descricao", "empresa"] as const;
const offsetLabel = (n: number) => (n < 0 ? `${-n} dia(s) antes` : n === 0 ? "No dia do vencimento" : `${n} dia(s) após`);

function preview(tpl: string, empresa: string) {
  const v: Record<string, string> = { cliente: "Maria Silva", valor: formatBRL(150000), vencimento: "15/10/2026", descricao: "Consultoria de outubro", empresa };
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => v[k] ?? `{{${k}}}`);
}

function LembretesPage() {
  const ent = useEntitlements();
  const rules = useQuery({ queryKey: ["rules"], queryFn: async () => {
    const { data, error } = await supabase.from("reminder_rules").select("*").order("offset_days");
    if (error) throw error;
    return data as Rule[];
  } });
  const logs = useQuery({ queryKey: ["recent-logs"], queryFn: async () => {
    const { data, error } = await supabase.from("reminder_logs").select("id, status, sent_to, sent_at, manual, entries(description)").neq("error", "pending").order("sent_at", { ascending: false }).limit(15);
    if (error) throw error;
    return data;
  } });
  const profile = useQuery({ queryKey: ["profile-lite"], queryFn: async () => (await supabase.from("profiles").select("business_name").maybeSingle()).data });
  const limits = ent.limits;
  const used = ent.usage?.emails_month ?? 0;
  const quota = limits?.emails_per_month ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lembretes</h1>
        <p className="text-sm text-muted-foreground">Sua régua de cobrança automática, enviada todo dia às 8h.</p>
      </div>

      <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">E-mails enviados este mês</span>
          <span className="num">{used} de {quota}</span>
        </div>
        <Progress value={quota ? Math.min(100, (used / quota) * 100) : 0} className="mt-2 h-2" aria-label="Uso mensal de e-mails" />
        {ent.emailsNearLimit && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-warning"><AlertTriangle className="h-4 w-4" />Você está perto da sua cota. <Link to="/planos" className="underline">Fazer upgrade</Link></p>
        )}
      </section>

      {!limits?.edit_rule_days && (
        <p className="flex items-center gap-2 rounded-xl bg-muted p-3 text-sm text-muted-foreground"><Lock className="h-4 w-4" />No plano Starter a régua é fixa. <Link to="/planos" className="font-medium text-primary underline">Faça upgrade</Link> para editar dias e etapas.</p>
      )}

      {rules.isLoading ? <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        : rules.isError ? <ErrorBox onRetry={() => rules.refetch()} />
        : !rules.data?.length ? <p className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">Nenhuma etapa encontrada. Recarregue a página para restaurar a régua padrão.</p>
        : (
          <ul className="space-y-3">
            {rules.data.map((r) => (
              <RuleCard key={r.id} rule={r} canDays={!!limits?.edit_rule_days && ent.canWrite} canTexts={!!limits?.edit_rule_texts && ent.canWrite} empresa={profile.data?.business_name ?? "Seu negócio"} />
            ))}
          </ul>
        )}

      <section className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
        <h2 className="font-semibold">Últimos envios</h2>
        {logs.isLoading ? <Skeleton className="mt-3 h-20 rounded-xl" />
          : logs.isError ? <ErrorBox onRetry={() => logs.refetch()} />
          : !logs.data?.length ? <div className="mt-4 flex flex-col items-center py-6 text-center text-sm text-muted-foreground"><Mail className="h-8 w-8" /><p className="mt-2">Nenhum lembrete enviado ainda.</p></div>
          : (
            <ul className="mt-3 divide-y text-sm">
              {logs.data.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{(l.entries as { description?: string } | null)?.description ?? "—"}{l.manual ? " · manual" : ""}</p>
                    <p className="truncate text-xs text-muted-foreground">{l.sent_to} · {new Date(l.sent_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
                  </div>
                  {l.status === "sent" ? <span className="flex shrink-0 items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" />Enviado</span>
                    : <span className="flex shrink-0 items-center gap-1 text-danger"><AlertTriangle className="h-4 w-4" />{l.status === "bounced" ? "Devolvido" : "Falhou"}</span>}
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}

function ErrorBox({ onRetry }: { onRetry: () => void }) {
  return <div className="mt-3 flex items-center gap-3 text-sm text-danger"><AlertTriangle className="h-4 w-4" />Erro ao carregar.<Button size="sm" variant="outline" className="h-10" onClick={onRetry}><RotateCcw className="mr-1 h-4 w-4" />Tentar de novo</Button></div>;
}

function RuleCard({ rule, canDays, canTexts, empresa }: { rule: Rule; canDays: boolean; canTexts: boolean; empresa: string }) {
  const qc = useQueryClient();
  const test = useServerFn(sendTest);
  const [offset, setOffset] = useState(rule.offset_days);
  const [subject, setSubject] = useState(rule.subject_tpl);
  const [body, setBody] = useState(rule.body_tpl);
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setOffset(rule.offset_days); setSubject(rule.subject_tpl); setBody(rule.body_tpl); }, [rule]);

  const save = useMutation({
    mutationFn: async (patch: Partial<Rule>) => {
      const { error } = await supabase.from("reminder_rules").update(patch).eq("id", rule.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["rules"] }); qc.invalidateQueries({ queryKey: ["activation"] }); toast.success("Régua atualizada."); },
    onError: (e) => toast.error(parseDbError(e).message),
  });
  const sendT = useMutation({
    mutationFn: () => test({ data: { ruleId: rule.id } }),
    onSuccess: (r) => { r.ok ? toast.success(r.message) : toast.error(r.message); qc.invalidateQueries({ queryKey: ["activation"] }); },
    onError: () => toast.error("Sem conexão. Tente novamente."),
  });
  const insertVar = (v: string) => {
    const el = bodyRef.current;
    const tag = `{{${v}}}`;
    if (!el) return setBody((b) => b + tag);
    const s = el.selectionStart, e = el.selectionEnd;
    setBody(body.slice(0, s) + tag + body.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + tag.length, s + tag.length); });
  };

  return (
    <li className="rounded-2xl border bg-card p-5 shadow-[var(--shadow-soft)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{rule.label}</p>
          <p className="text-sm text-muted-foreground">{offsetLabel(rule.offset_days)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`act-${rule.id}`} className="text-sm">{rule.active ? "Ativa" : "Inativa"}</Label>
          <Switch id={`act-${rule.id}`} checked={rule.active} disabled={!canDays || save.isPending} onCheckedChange={(v) => save.mutate({ active: v })} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" className="h-10" onClick={() => setOpen(!open)}>{open ? "Fechar" : canDays ? "Editar" : "Ver e-mail"}</Button>
        <Button size="sm" variant="outline" className="h-10 rounded-lg" disabled={sendT.isPending} onClick={() => sendT.mutate()}><Send className="mr-1 h-4 w-4" />Enviar e-mail de teste para mim</Button>
      </div>
      {open && (
        <div className="mt-4 grid gap-4 border-t pt-4 lg:grid-cols-2">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate({ offset_days: offset, ...(canTexts ? { subject_tpl: subject.slice(0, 200), body_tpl: body.slice(0, 3000) } : {}) }); }}>
            <div>
              <Label htmlFor={`off-${rule.id}`}>Dias em relação ao vencimento (negativo = antes)</Label>
              <Input id={`off-${rule.id}`} type="number" min={-30} max={60} disabled={!canDays} value={offset} onChange={(e) => setOffset(Math.max(-30, Math.min(60, Number(e.target.value) || 0)))} className="mt-1.5 h-11 w-32 rounded-xl" />
            </div>
            <div>
              <Label htmlFor={`sub-${rule.id}`}>Assunto</Label>
              <Input id={`sub-${rule.id}`} disabled={!canTexts} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} className="mt-1.5 h-11 rounded-xl" />
            </div>
            <div>
              <Label htmlFor={`body-${rule.id}`}>Mensagem</Label>
              <Textarea id={`body-${rule.id}`} ref={bodyRef} disabled={!canTexts} value={body} maxLength={3000} rows={6} onChange={(e) => setBody(e.target.value)} className="mt-1.5 rounded-xl" />
              {canTexts ? (
                <div className="mt-2 flex flex-wrap gap-1.5">{VARS.map((v) => <button key={v} type="button" onClick={() => insertVar(v)} className="h-8 rounded-full border px-2.5 text-xs hover:bg-accent">{`{{${v}}}`}</button>)}</div>
              ) : <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" />Editar textos está disponível no plano Business.</p>}
            </div>
            {canDays && <Button type="submit" className="h-11 rounded-xl" disabled={save.isPending}>Salvar etapa</Button>}
          </form>
          <div className="rounded-xl border bg-background p-4 text-sm" aria-label="Prévia do e-mail">
            <p className="text-xs text-muted-foreground">Prévia</p>
            <p className="mt-2"><span className="text-muted-foreground">Assunto:</span> {preview(subject, empresa)}</p>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed">{preview(body, empresa)}</p>
          </div>
        </div>
      )}
    </li>
  );
}
