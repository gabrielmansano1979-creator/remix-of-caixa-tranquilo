import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { PLANS, FIRST_PIX_DISCOUNT, type PlanId } from "@/config/plans";
import { formatBRL } from "@/lib/format";
import { createCheckoutSession } from "@/lib/billing.functions";
import { useEntitlements } from "@/hooks/use-entitlements";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { PixPaymentDialog } from "@/components/pix-payment-dialog";
import { isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/identity";
import { supabase } from "@/integrations/supabase/client";

const ORDER: PlanId[] = ["starter", "pro", "business"];

export function PlanPicker({ referralCode }: { referralCode?: string }) {
  const ent = useEntitlements();
  const checkout = useServerFn(createCheckoutSession);
  const [yearly, setYearly] = useState(ent.access?.billing_interval === "year");
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [doc, setDoc] = useState("");
  const [legalName, setLegalName] = useState("");
  const [pixData, setPixData] = useState<{ qrCode?: string; copyPaste?: string; paymentId?: string } | null>(null);
  const subscribed = ent.access?.has_subscription && ["active", "past_due", "pending_pix"].includes(ent.access.status);
  const current = subscribed ? ent.access?.plan : null;

  const go = async (plan: PlanId) => {
    const p = PLANS.find((x) => x.id === plan);
    if (!p) return;
    if (ent.usage && ent.usage.pending_entries > p.limits.pendingEntries) {
      return toast.error(`Você tem ${ent.usage.pending_entries} contas pendentes; o ${p.name} permite ${p.limits.pendingEntries}. Quite ou exclua algumas antes.`);
    }
    const digits = normalizeCpfCnpj(doc);
    if (legalName.trim().length < 2 || legalName.trim().length > 160) {
      return toast.error("Informe seu nome civil completo, como consta no documento.");
    }
    if (!isValidCpfCnpj(digits)) return toast.error("Informe um CPF ou CNPJ válido, com dígitos verificadores corretos.");
    setBusy(plan);
    track("upgrade_click", { plan, interval: yearly ? "year" : "month" });
    const { data: authResult, error: authError } = await supabase.auth.getUser();
    if (authError || !authResult.user) {
      toast.error("Entre na sua conta para continuar a assinatura.");
      setBusy(null);
      return;
    }
    const { error: nameError } = await supabase
      .from("profiles")
      .update({ full_name: legalName.trim() })
      .eq("user_id", authResult.user.id);
    if (nameError) {
      toast.error("Não foi possível salvar seu nome civil no perfil. Confira o acesso e tente novamente.");
      setBusy(null);
      return;
    }
    try {
      const r = await checkout({ data: { plan, interval: yearly ? "year" : "month", cpfCnpj: digits, legalName: legalName.trim(), referralCode } });
      if (r.error) {
        toast.error(r.error);
      } else if (r.qrCode) {
        setPixData({ qrCode: r.qrCode, copyPaste: r.copyPaste, paymentId: r.paymentId });
      } else if (r.url) {
        window.location.href = r.url;
      } else {
        toast.error("Não foi possível continuar.");
      }
    } catch { toast.error("Sem conexão. Tente novamente."); }
    setBusy(null);
  };

  return (
    <div>
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Período de cobrança" className="inline-flex rounded-xl bg-muted p-1">
          {([["Mensal", false], ["Anual", true]] as const).map(([l, v]) => (
            <Button variant="ghost" key={l} role="radio" aria-checked={yearly === v} onClick={() => setYearly(v)} className={`h-10 rounded-lg px-4 text-sm font-medium ${yearly === v ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              {l}{v && <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">Anual · 2 meses grátis</span>}
            </Button>
          ))}
        </div>
      </div>
      <div className="mt-4 text-center text-sm text-muted-foreground">
        {referralCode ? "Cupom de parceiro com 10% de desconto aplicado. Não cumulativo com outras ofertas." : "Primeiro pagamento via Pix com 20% de desconto e confirmação automática em poucos segundos."}
      </div>
      <div className="mx-auto mt-6 max-w-xs">
        <label htmlFor="legal-name" className="text-sm font-medium">Nome civil completo (como consta no documento)</label>
        <input id="legal-name" autoComplete="name" required minLength={2} maxLength={160} value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Nome completo do titular"
          className="mt-1.5 h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
      <div className="mx-auto mt-3 max-w-xs">
        <label htmlFor="cpf-cnpj" className="text-sm font-medium">CPF ou CNPJ (obrigatório para o Pix)</label>
        <input id="cpf-cnpj" inputMode="text" autoCapitalize="characters" autoComplete="off" value={doc} onChange={(e) => setDoc(e.target.value.toUpperCase())} placeholder="CPF ou CNPJ" maxLength={18}
          className="mt-1.5 h-11 w-full rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Aceita os dois CNPJs válidos: o formato tradicional numérico (11.222.333/0001-81) e o novo alfanumérico (12.ABC.345/01DE-35). O formato antigo continua válido.</p>
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
      <p className="mx-auto mt-4 max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">Pagamento inicial via Pix com confirmação automática do Asaas. Depois da confirmação, as próximas cobranças serão geradas conforme o plano mensal ou anual, mas cada Pix deverá ser pago manualmente. Não é débito automático via Pix.</p>

      <PixPaymentDialog
        open={!!pixData}
        onOpenChange={(open) => !open && setPixData(null)}
        qrCode={pixData?.qrCode}
        copyPaste={pixData?.copyPaste}
        paymentId={pixData?.paymentId}
      />
    </div>
  );
}
