import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade (LGPD) — Critical Cash" },
      { name: "description", content: "Informações sobre o tratamento de dados pessoais no Critical Cash." },
      { property: "og:title", content: "Política de Privacidade — Critical Cash" },
      { property: "og:description", content: "Tratamento de dados pessoais no Critical Cash." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/privacidade" }],
  }),
  component: () => (
    <LegalPage title="Política de Privacidade" updated="[PREENCHER DATA]">
      <p>Esta política descreve o tratamento de dados pessoais pelo operador do Critical Cash, [RAZÃO SOCIAL/NOME DO RESPONSÁVEL], contato [PREENCHER DADOS DO CONTROLADOR/ENCARREGADO]. Complete os dados de identificação e valide o texto com assessoria adequada antes de publicar.</p>
      <h2>1. Categorias de dados</h2>
      <p>Dependendo dos recursos utilizados, o serviço pode tratar dados de cadastro e autenticação, informações do estabelecimento, registros financeiros inseridos pelo usuário (como valores e vencimentos), dados de contas a receber e informações técnicas necessárias à segurança e operação do serviço. Evite inserir dados pessoais de terceiros que não sejam necessários.</p>
      <h2>2. Finalidades e bases legais</h2>
      <p>Os dados podem ser tratados para criar e proteger contas, fornecer as funcionalidades solicitadas, processar assinaturas quando contratadas, prevenir abuso, manter a segurança e cumprir obrigações legais. As bases legais aplicáveis devem ser confirmadas pelo controlador conforme cada finalidade e contexto de uso.</p>
      <h2>3. Dados de terceiros cadastrados pelo usuário</h2>
      <p>O usuário é responsável por garantir que possui autorização e base legal para inserir dados de seus clientes no serviço. O Critical Cash oferece ferramentas de organização e preparação de mensagens; o usuário deve revisar e confirmar manualmente qualquer envio pelo WhatsApp e atender aos pedidos e direitos dos titulares de dados.</p>
      <h2>4. Compartilhamento e operadores</h2>
      <p>Dados podem ser processados por provedores de infraestrutura, hospedagem, banco de dados, autenticação e pagamento estritamente necessários às funcionalidades habilitadas. Antes da publicação, identifique os fornecedores efetivamente utilizados, as finalidades de cada um e eventuais transferências internacionais de dados.</p>
      <h2>5. Retenção e segurança</h2>
      <p>Os dados devem ser mantidos apenas pelo período necessário às finalidades informadas ou para cumprimento de obrigações legais. O prazo de retenção e o procedimento de exclusão devem ser definidos e confirmados pelo operador antes da publicação. São adotadas medidas técnicas e organizacionais de segurança compatíveis com o serviço, sem garantia de risco zero.</p>
      <h2>6. Direitos dos titulares</h2>
      <p>Nos termos da legislação aplicável, titulares podem ter direitos de confirmação de tratamento, acesso, correção, anonimização, bloqueio, eliminação, portabilidade e informação sobre compartilhamentos, conforme as condições legais. Informe aqui o canal operacional para receber e responder solicitações: [PREENCHER CANAL E PROCEDIMENTO].</p>
      <h2>7. Cookies, registros e contato</h2>
      <p>O serviço pode utilizar armazenamento técnico necessário à autenticação, segurança e funcionamento. Descreva aqui eventuais cookies ou ferramentas adicionais de análise que estejam efetivamente habilitados. Para assuntos de privacidade, entre em contato pelo e-mail criticalcash2026@gmail.com e informe o nome legal do controlador e o responsável aplicável antes da publicação.</p>
    </LegalPage>
  ),
});
