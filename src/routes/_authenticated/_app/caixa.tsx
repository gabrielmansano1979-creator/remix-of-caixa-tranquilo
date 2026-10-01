import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { ComingSoon } from "@/components/placeholder";

export const Route = createFileRoute("/_authenticated/_app/caixa")({
  head: () => ({ meta: [{ title: "Caixa — Caixa Crítico" }, { name: "robots", content: "noindex" }] }),
  component: () => <ComingSoon title="Caixa" icon={Wallet} text="O semáforo e a projeção de 15 e 30 dias chegam na próxima etapa." />,
});
