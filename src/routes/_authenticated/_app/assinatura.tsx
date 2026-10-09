import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, CreditCard, Loader2, XCircle } from "lucide-react";
import { useEntitlements } from "@/hooks/use-entitlements";
import { getPlan } from "@/config/plans";
import { formatDate } from "@/lib/format";
import { cancelSubscription, createPortalSession } from "@/lib/billing.functions";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/_app/assinatura")({
  validateSearch: z.object({ sucesso: z.number().optional() }),
  head: () => ({ meta: [{ title: "Assinatura — Critical Cash" }, { name: "description", content: "Gerencie sua assinatura e o período de teste do Critical Cash." }, { property: "og:title", content: "Assinatura — Critical Cash" }, { property: "og:description", content: "Gerencie sua assinatura e o período de teste do Critical Cash." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: AssinaturaPage,
});

const STATUS = {
  trialing: { label: "Teste grátis", icon: Clock, cls: "text-primary" },
  active: { label: "Ativa", icon: CheckCircle2, cls: "text-success" },
  pending_pix: { label: "Pix pendente de confirmação", icon: Clock, cls: "text-warning" },
  past_due: { label: "Pagamento pendente", icon: AlertTriangle, cls: "text-warning" },
  canceled: { label: "Cancelada (acesso até o fim do período)", icon: XCircle, cls: "text-warning" },
  expired: { label: "Expirada — somente leitura", icon: XCircle, cls: "text-danger" },
};
const REASONS = ["Está caro", "Não uso o suficiente", "Faltou um recurso", "Vou usar outra ferramenta", "Outro motivo"];

function AssinaturaPage() {
  const { sucesso } = Route.useSearch();
  const ent = useEntitlements();
  const qc = useQueryClient();
  const portal = useServerFn(createPortalSession);
  const cancel = useServerFn(cancelSubscription);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (sucesso) { toast.success("Assinatura confirmada! Pode levar alguns segundos para atualizar."); setTimeout(() => qc.invalidateQueries({ queryKey: ["access"] }), 3000); }
  }, [sucesso, qc]);

  if (ent.loading) return <div className="space-y-4"><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div>;
  const a = ent.access;
  if (!a) return <p className="rounded-2xl border bg-card p-8 text-center text-danger">Não foi possível carregar sua assinatura. Recarregue a página.</p>;
  const st = STATUS[a.status];
  const plan = getPlan(a.plan);

  const openPortal = async () => {
    setBusy(true);
    try { const r = await portal(); r.url ? (window.location.href = r.url) : toast.error(r.error ?? "Erro"); } catch { toast.error("Sem conexão."); }
    setBusy(false);
  };
  const doCancel = async () => {
    setBusy(true);
    try {
      const r = await cancel({ data: { reason: [reason, note].filter(Boolean).join(" — ").slice(0, 500) } });
      r.ok ? toast.success(r.message) : toast.error(r.message);
      if (r.ok) { track("subscription_cancel", { reason }); setCancelOpen(false); qc.invalidateQueries({ queryKey: ["access"] }); }
    } catch { toast.error("Sem conexão."); }
    setBusy(false);
  };

  const Usage = ({ label, used, lim }: { label: string; used: number; lim: number }) => (
    <div>
      <div className="flex justify-between text-sm"><span>{label}</span><span className="num">{used} / {lim}</span></div>
      <Progress value={Math.min(100, (used / lim) * 100)} className="mt-1.5 h-2" aria-label={label} />
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Assinatura</h1>
      <div className="rounded-2xl border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
        Pagamentos via Pix com confirmação automática do Asaas. Primeiro pagamento com 20% de desconto em planos mensais e anuais.
      </div>
      <section className="rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]">
        <p className="text-sm text-muted-foreground">Plano {a.status === "trialing" ? "(nível do teste)" : "atual"}</p>
        <p className="mt-1 text-2xl font-semibold">{plan.name}{a.billing_interval ? <span className="text-base font-normal text-muted-foreground"> · {a.billing_interval === "year" ? "anual" : "mensal"}</span> : null}</p>
        <p className={`mt-2 flex items-center gap-1.5 text-sm font-medium ${st.cls}`}><st.icon className="h-4 w-4" />{st.label}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          {a.status === "trialing" && a.trial_ends_at && <div><dt className="text-muted-foreground">Teste termina em</dt><dd className="num">{formatDate(a.trial_ends_at)}</dd></div>}
          {a.status === "pending_pix" && <div><dt className="text-muted-foreground">Status</dt><dd className="num text-warning">Aguardando confirmação do Pix</dd></div>}
          {a.current_period_end && <div><dt className="text-muted-foreground">{a.cancel_at_period_end ? "Acesso até" : "Próxima cobrança"}</dt><dd className="num">{formatDate(a.current_period_end)}</dd></div>}
          {a.status === "past_due" && a.grace_ends_at && <div><dt className="text-muted-foreground">Atualize o pagamento até</dt><dd className="num text-warning">{formatDate(a.grace_ends_at)}</dd></div>}
        </dl>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild className="h-11 rounded-xl"><Link to="/planos">{a.has_subscription ? "Trocar de plano" : "Escolher plano"}</Link></Button>
          {a.has_subscription && <Button variant="outline" className="h-11 rounded-xl" disabled={busy} onClick={openPortal}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}Gerenciar pagamento</Button>}
          {a.has_subscription && a.status === "active" && !a.cancel_at_period_end && <Button variant="ghost" className="h-11 rounded-xl text-danger" onClick={() => setCancelOpen(true)}>Cancelar assinatura</Button>}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]">
        <h2 className="font-semibold">Uso do plano</h2>
        {ent.usage ? (
          <>
            <Usage label="Contas pendentes" used={ent.usage.pending_entries} lim={a.limits.pending_entries} />
            <Usage label="E-mails de cobrança este mês" used={ent.usage.emails_month} lim={a.limits.emails_per_month} />
          </>
        ) : <Skeleton className="h-16 rounded-xl" />}
      </section>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Antes de ir…</DialogTitle>
            <DialogDescription>Seus lembretes param e você perde a projeção ao fim do período. Se o problema for preço, o plano anual sai 2 meses mais barato — ou troque para o Starter.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Por que está cancelando? (opcional)</Label>
            <RadioGroup value={reason} onValueChange={setReason}>
              {REASONS.map((r) => <div key={r} className="flex items-center gap-2"><RadioGroupItem value={r} id={r} /><Label htmlFor={r} className="font-normal">{r}</Label></div>)}
            </RadioGroup>
            <Textarea placeholder="Quer contar mais?" maxLength={400} value={note} onChange={(e) => setNote(e.target.value)} className="rounded-xl" aria-label="Comentário" />
          </div>
          <DialogFooter className="gap-2">
            <Button asChild variant="outline" className="h-11 rounded-xl"><Link to="/planos">Ver outros planos</Link></Button>
            <Button variant="destructive" className="h-11 rounded-xl" disabled={busy} onClick={doCancel}>Confirmar cancelamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
