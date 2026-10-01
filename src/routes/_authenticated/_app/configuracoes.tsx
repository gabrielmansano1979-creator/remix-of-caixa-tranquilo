import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { ComingSoon } from "@/components/placeholder";

export const Route = createFileRoute("/_authenticated/_app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Caixa Crítico" }, { name: "robots", content: "noindex" }] }),
  component: () => <ComingSoon title="Configurações" icon={Settings} text="Dados do negócio, saldo e colchão poderão ser editados aqui em breve." />,
});
