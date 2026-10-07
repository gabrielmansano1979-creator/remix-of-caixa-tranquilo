import { createFileRoute } from "@tanstack/react-router";
import { PlanPicker } from "@/components/plan-picker";

export const Route = createFileRoute("/_authenticated/_app/planos")({
  head: () => ({ meta: [{ title: "Planos — Critical Cash" }, { name: "description", content: "Compare planos e escolha sua assinatura após os 7 dias grátis." }, { property: "og:title", content: "Planos — Critical Cash" }, { property: "og:description", content: "Compare planos e escolha sua assinatura após os 7 dias grátis." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <div>
      <h1 className="text-center text-2xl font-semibold tracking-tight">Escolha seu plano</h1>
      <p className="mt-1 text-center text-sm text-muted-foreground">Cancele quando quiser. Sem fidelidade.</p>
      <div className="mt-8"><PlanPicker /></div>
    </div>
  ),
});
