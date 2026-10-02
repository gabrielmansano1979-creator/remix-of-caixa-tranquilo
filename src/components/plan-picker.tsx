import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { PLANS, type PlanId } from "@/config/plans";
import { formatBRL } from "@/lib/format";
import { createCheckoutSession } from "@/lib/billing.functions";
import { useEntitlements } from "@/hooks/use-entitlements";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";

const ORDER: PlanId[] = ["starter", "pro", "business"];

export function PlanPicker() {
  const ent = useEntitlements();
  const checkout = useServerFn(createCheckoutSession);
  const [yearly, setYearly] = useState(ent.access?.billing_interval === "year");
  const [busy, setBusy] = useState<PlanId | null>(null);
  const subscribed = ent.access?.has_subscription && ["active", "past_due", "canceled"].includes(ent.access.status);
  const current = subscribed ? ent.access?.plan : null;

  const go = async (plan: PlanId) => {
    const p = PLANS.find((x) => x.id === plan)!;
    if (ent.usage && ent.usage.pending_entries > p.limits.pendingEntries) {
      return toast.error(`Você tem ${ent.usage.pending_entries} contas pendentes; o ${p.name} permite ${p.limits.pendingEntries}. Quite ou exclua algumas antes.`);
    }
    setBusy(plan);
    track("upgrade_click", { plan, interval: yearly ? "year" : "month" });
    try {
      const r = await checkout({ data: { plan, interval: yearly ? "year" : "month" } });
      if (r.url) window.location.href = r.url;
      else toast.error(r.error ?? "Não foi possível continuar.");
    } catch { toast.error("Sem conexão. Tente novamente."); }
    setBusy(null);
  };

  return (
    <div>
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Período de cobrança" className="inline-flex rounded-xl bg-muted p-1">
          {([["Mensal", false], ["Anual", true]] as const).map(([l, v]) => (
            <button key={l} role="radio" aria-checked={yearly === v} onClick={() => setYearly(v)} className={`h-10 rounded-lg px-4 text-sm font-medium ${yearly === v ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              {l}{v && <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">2 meses grátis</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = current === p.id;
          const label = !current ? "Assinar" : isCurrent ? "Plano atual" : ORDER.indexOf(p.id) > ORDER.indexOf(current) ? "Fazer upgrade" : "Fazer downgrade";
          return (
            <div key={p.id} className={`relative rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)] ${isCurrent ? "border-primary ring-2 ring-primary" : p.popular && !current ? "border-primary" : ""}`}>
              {isCurrent ? <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">Seu plano</span>
                : p.popular && <span className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">Mais popular</span>}
              <h3 className="text-lg font-semibold">{p.name}</h3>
              <p className="mt-2"><span className="num text-3xl font-bold">{formatBRL(yearly ? p.priceYearCents : p.priceMonthCents, true)}</span><span className="text-muted-foreground">/{yearly ? "ano" : "mês"}</span></p>
              <ul className="mt-5 space-y-2 text-sm">{p.features.map((f) => <li key={f} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />{f}</li>)}</ul>
              <Button className="mt-6 h-11 w-full rounded-xl" variant={isCurrent ? "outline" : "default"} disabled={isCurrent || busy !== null} onClick={() => go(p.id)}>
                {busy === p.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{label}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">Troca de plano com cobrança proporcional calculada automaticamente. Pagamento seguro via Stripe.</p>
    </div>
  );
}
