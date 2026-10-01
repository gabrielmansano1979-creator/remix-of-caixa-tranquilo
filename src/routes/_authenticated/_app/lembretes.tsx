import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { ComingSoon } from "@/components/placeholder";

export const Route = createFileRoute("/_authenticated/_app/lembretes")({
  head: () => ({ meta: [{ title: "Lembretes — Caixa Crítico" }, { name: "robots", content: "noindex" }] }),
  component: () => <ComingSoon title="Lembretes" icon={Bell} text="Sua régua padrão (−2, 0, +3 e +7 dias) já está ativa. A tela de edição chega na próxima etapa." />,
});
