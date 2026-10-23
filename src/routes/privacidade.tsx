import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade (LGPD) — Critical Cash" },
      { name: "description", content: "Como o Critical Cash trata dados pessoais conforme a LGPD." },
      { property: "og:title", content: "Política de Privacidade — Critical Cash" },
      { property: "og:description", content: "Tratamento de dados pessoais conforme a LGPD." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/privacidade" }],
  }),
  component: () => (
    <LegalPage title="Política de Privacidade" updated="21/10/2026">
      <p>Esta política descreve o tratamento de dados pessoais no Critical Cash, conforme a Lei nº 13.709/2018 (LGPD). Antes do lançamento comercial, o responsável pelo serviço deve completar sua identificação: [RAZÃO SOCIAL], CNPJ [CNPJ] e canal de contato do encarregado ou responsável por privacidade.</p>
      <h2>1. Dados tratados</h2>
      <ul>
        <li>Dados de conta e cadastro, como nome, e-mail, telefone e nome do negócio, conforme os campos utilizados na plataforma.</li>
        <li>Dados financeiros e de movimentações inseridos ou importados pelo usuário, que podem conter informações pessoais de terceiros.</li>
        <li>Dados técnicos e registros de segurança necessários à operação, prevenção de abuso e diagnóstico de falhas.</li>
        <li>Dados de assinatura e pagamento necessários para processar a contratação e manter seu estado.</li>
      </ul>
      <h2>2. Finalidades e bases legais</h2>
      <p>Os dados são tratados para fornecer e proteger o serviço, autenticar usuários, importar e exibir movimentações, administrar assinaturas, atender solicitações e cumprir obrigações legais. A base legal aplicável depende da finalidade e das circunstâncias do tratamento, podendo incluir execução de contrato, cumprimento de obrigação legal e legítimo interesse quando cabível.</p>
      <h2>3. Dados de terceiros inseridos pelo usuário</h2>
      <p>O usuário deve assegurar que possui autorização ou outra base legal adequada para inserir dados de terceiros e é responsável pela legitimidade dos dados que fornece. O Critical Cash deve limitar o tratamento desses dados ao necessário para prestar as funcionalidades solicitadas e cumprir suas obrigações legais.</p>
      <h2>4. Compartilhamento</h2>
      <p>Dados podem ser processados por fornecedores necessários à hospedagem, banco de dados, autenticação, suporte e processamento de pagamentos. A lista final de fornecedores e suas funções deve ser mantida atualizada conforme as integrações efetivamente habilitadas na produção. Não vendemos dados pessoais.</p>
      <h2>5. Retenção e segurança</h2>
      <p>Os dados são mantidos pelo período necessário à prestação do serviço e ao cumprimento de obrigações legais, regulatórias e de segurança. Os prazos específicos de retenção e exclusão devem ser informados de acordo com o funcionamento efetivo da plataforma. Aplicamos controles técnicos e organizacionais para proteger os dados, sem que isso represente garantia de risco zero.</p>
      <h2>6. Direitos dos titulares</h2>
      <p>Os titulares podem exercer os direitos previstos na LGPD, nos limites legais aplicáveis, mediante solicitação pelo e-mail criticalcash2026@gmail.com. A solicitação poderá exigir verificação de identidade para proteger os dados. O usuário deve evitar inserir dados de terceiros sem base legal adequada.</p>
      <h2>7. Contato e encarregado</h2>
      <p>Canal de contato: criticalcash2026@gmail.com. A identidade e os dados de contato do controlador e, quando aplicável, do encarregado pelo tratamento de dados pessoais devem ser completados antes do lançamento comercial.</p>
    </LegalPage>
  ),
});
