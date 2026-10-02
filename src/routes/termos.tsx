import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Caixa Crítico" },
      { name: "description", content: "Termos de uso do Caixa Crítico, previsão de caixa e cobrança automática." },
      { property: "og:title", content: "Termos de Uso — Caixa Crítico" },
      { property: "og:description", content: "Condições de uso do serviço Caixa Crítico." },
    ],
    links: [{ rel: "canonical", href: "/termos" }],
  }),
  component: () => (
    <LegalPage title="Termos de Uso" updated="[DD/MM/AAAA]">
      <p>Estes Termos regulam o uso do Caixa Crítico, oferecido por [RAZÃO SOCIAL], CNPJ [00.000.000/0000-00], com sede em [ENDEREÇO].</p>
      <h2>1. O serviço</h2>
      <p>O Caixa Crítico projeta o fluxo de caixa de curto prazo com base nas informações que você cadastra e envia lembretes de cobrança por e-mail aos seus clientes. As projeções são estimativas e não constituem consultoria financeira.</p>
      <h2>2. Conta e teste grátis</h2>
      <p>O teste grátis dura 7 dias, sem cartão. Ao final, sem assinatura, a conta passa a modo somente leitura e os lembretes são pausados. Dados são preservados por 90 dias.</p>
      <h2>3. Assinatura e pagamento</h2>
      <ul><li>Cobrança recorrente mensal ou anual, processada pela Stripe.</li><li>Cancelamento a qualquer momento; o acesso segue até o fim do período pago.</li><li>Não há reembolso proporcional, salvo exigência legal.</li></ul>
      <h2>4. Uso aceitável</h2>
      <p>Você se compromete a enviar cobranças apenas a pessoas com quem tem relação comercial legítima e a não usar o serviço para spam, assédio ou cobrança abusiva (Código de Defesa do Consumidor, art. 42).</p>
      <h2>5. Responsabilidades</h2>
      <p>Você é responsável pela veracidade dos dados cadastrados. Não nos responsabilizamos por decisões tomadas com base nas projeções.</p>
      <h2>6. Contato</h2>
      <p>[contato@seudominio.com.br]</p>
    </LegalPage>
  ),
});
