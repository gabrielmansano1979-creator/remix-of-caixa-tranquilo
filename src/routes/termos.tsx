import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Critical Cash" },
      { name: "description", content: "Termos de uso do Critical Cash para acompanhamento e projeção do fluxo de caixa." },
      { property: "og:title", content: "Termos de Uso — Critical Cash" },
      { property: "og:description", content: "Condições de uso do serviço Critical Cash." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/termos" }],
  }),
  component: () => (
    <LegalPage title="Termos de Uso" updated="21/10/2026">
      <p>Estes Termos regulam o uso do Critical Cash. Antes de disponibilizar o serviço comercialmente, o responsável legal deve completar a identificação do fornecedor: [RAZÃO SOCIAL], CNPJ [CNPJ], com sede em [ENDEREÇO].</p>
      <h2>1. O serviço</h2>
      <p>O Critical Cash auxilia no acompanhamento e na projeção do fluxo de caixa com base nas informações inseridas ou importadas pelo usuário. Projeções e classificações automatizadas são estimativas e devem ser conferidas pelo usuário; não constituem consultoria contábil, financeira ou tributária.</p>
      <h2>2. Conta e período de avaliação</h2>
      <p>O período de avaliação e as funcionalidades disponíveis são os informados na tela de cadastro e na oferta vigente. Ao fim do período de avaliação, a continuidade do acesso depende das condições exibidas na plataforma. Antes do lançamento, devem ser confirmadas e publicadas as regras efetivas de acesso, retenção e encerramento da conta.</p>
      <h2>3. Assinatura e pagamento</h2>
      <p>Os planos, preços, periodicidade, meio de pagamento e condições aplicáveis são apresentados no checkout antes da confirmação da contratação. O processamento do pagamento é realizado pelo provedor identificado nessa etapa. A contratação só deve ser considerada concluída após a confirmação do pagamento pela plataforma.</p>
      <ul>
        <li>As condições de renovação e cancelamento devem ser apresentadas antes da contratação.</li>
        <li>Os direitos legais do consumidor, inclusive os aplicáveis ao arrependimento e ao reembolso, permanecem preservados.</li>
      </ul>
      <h2>4. Uso aceitável e dados financeiros</h2>
      <p>O usuário é responsável por possuir base legítima para inserir dados pessoais e financeiros de terceiros e por conferir os documentos importados, as classificações e os resultados apresentados. É proibido usar o serviço para fraude, spam, assédio ou cobrança abusiva.</p>
      <h2>5. Limites das projeções</h2>
      <p>Os resultados dependem da qualidade, completude e atualização dos dados fornecidos. O usuário deve verificar os lançamentos e não deve tomar decisões exclusivamente com base em uma projeção automática.</p>
      <h2>6. Privacidade e suporte</h2>
      <p>O tratamento de dados pessoais é descrito na Política de Privacidade. Para suporte, entre em contato pelo e-mail criticalcash2026@gmail.com.</p>
    </LegalPage>
  ),
});
