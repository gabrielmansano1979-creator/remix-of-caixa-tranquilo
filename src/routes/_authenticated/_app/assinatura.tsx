import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { ComingSoon } from "@/components/placeholder";

export const Route = createFileRoute("/_authenticated/_app/assinatura")({
  head: () => ({ meta: [{ title: "Assinatura — Caixa Crítico" }, { name: "robots", content: "noindex" }] }),
  component: () => <ComingSoon title="Assinatura" icon={CreditCard} text="Planos e pagamento chegam na próxima etapa." />,
});
