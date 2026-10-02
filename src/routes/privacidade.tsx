import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade (LGPD) — Caixa Crítico" },
      { name: "description", content: "Como o Caixa Crítico trata seus dados pessoais conforme a LGPD." },
      { property: "og:title", content: "Política de Privacidade — Caixa Crítico" },
      { property: "og:description", content: "Tratamento de dados pessoais conforme a LGPD." },
    ],
    links: [{ rel: "canonical", href: "/privacidade" }],
  }),
  component: () => (
    <LegalPage title="Política de Privacidade" updated="[DD/MM/AAAA]">
      <p>Esta política descreve como [RAZÃO SOCIAL] (“controladora”) trata dados pessoais no Caixa Crítico, conforme a Lei nº 13.709/2018 (LGPD).</p>
      <h2>1. Dados que coletamos</h2>
      <ul><li>Da conta: e-mail, nome do negócio, e-mail de resposta.</li><li>Financeiros cadastrados por você: contas, valores, vencimentos.</li><li>De terceiros (seus clientes): nome e e-mail, usados apenas para enviar lembretes em seu nome — você é o controlador desses dados e nós, operadores.</li><li>Técnicos: registros de acesso e envio de e-mails.</li></ul>
      <h2>2. Finalidades e bases legais</h2>
      <ul><li>Prestar o serviço (execução de contrato).</li><li>Cobrança da assinatura (execução de contrato).</li><li>Segurança e prevenção a fraudes (legítimo interesse).</li><li>Cumprimento de obrigações legais.</li></ul>
      <h2>3. Compartilhamento</h2>
      <p>Usamos provedores essenciais: hospedagem e banco de dados, Stripe (pagamentos) e Resend (e-mails). Não vendemos dados.</p>
      <h2>4. Retenção</h2>
      <p>Mantemos os dados enquanto a conta estiver ativa e por até 90 dias após o fim da assinatura, salvo obrigação legal.</p>
      <h2>5. Seus direitos</h2>
      <p>Você pode acessar, corrigir, exportar e excluir seus dados diretamente em Configurações, ou solicitar pelo e-mail do encarregado.</p>
      <h2>6. Descadastro de lembretes</h2>
      <p>Todo e-mail de cobrança contém um link para o destinatário deixar de receber lembretes.</p>
      <h2>7. Encarregado (DPO)</h2>
      <p>[Nome do encarregado] — [dpo@seudominio.com.br]</p>
    </LegalPage>
  ),
});
