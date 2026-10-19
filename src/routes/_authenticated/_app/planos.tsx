import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PlanPicker } from "@/components/plan-picker";

export const Route = createFileRoute("/_authenticated/_app/planos")({
  validateSearch: z.object({ ref: z.string().trim().max(80).optional() }),
  head: () => ({ meta: [{ title: "Planos — Critical Cash" }, { name: "description", content: "Compare planos e escolha sua assinatura após os 14 dias grátis." }, { property: "og:title", content: "Planos — Critical Cash" }, { property: "og:description", content: "Compare planos e escolha sua assinatura após os 14 dias grátis." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: PlansPage,
});

function PlansPage() {
  const { ref } = Route.useSearch();
  return (
    <div>
      <h1 className="text-center text-2xl font-semibold tracking-tight">Escolha seu plano</h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">Cancele quando quiser. Sem fidelidade.</p>
      <div className="mt-4 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-center text-sm text-primary">
        {ref ? "Cupom de parceiro aplicado: 10% de desconto sem acumular com outras ofertas." : "1ª assinatura via Pix com 20% de desconto e confirmação automática em segundos."}
      </div>
      <div className="mt-8"><PlanPicker referralCode={ref} /></div>
    </div>
  );
}
