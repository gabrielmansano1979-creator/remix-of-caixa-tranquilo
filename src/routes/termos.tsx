import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Critical Cash" },
      { name: "description", content: "Condições de uso do Critical Cash, ferramenta de organização de recebíveis e previsão de caixa." },
      { property: "og:title", content: "Termos de Uso — Critical Cash" },
      { property: "og:description", content: "Condições de uso do serviço Critical Cash." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "/termos" }],
  }),
  component: () => (
    <LegalPage title="Termos de Uso" updated="[PREENCHER DATA]">
      <p>Estes Termos regulam o uso do Critical Cash, serviço operado por [RAZÃO SOCIAL/NOME DO RESPONSÁVEL], inscrito no [CPF/CNPJ] sob nº [PREENCHER], com endereço para contato em [PREENCHER ENDEREÇO]. Preencha e revise estas informações antes de disponibilizar o serviço ao público.</p>
      <h2>1. O serviço</h2>
      <p>O Critical Cash oferece recursos para organizar contas a receber, importar dados por CSV, visualizar projeções de caixa de 15 e 30 dias e preparar mensagens de cobrança. As projeções dependem dos dados fornecidos e são estimativas de apoio à gestão, não constituindo garantia de recebimento nem aconselhamento financeiro, contábil ou jurídico.</p>
      <h2>2. Conta e período de teste</h2>
      <p>O período de teste anunciado é de 7 dias, sem exigência de cartão para iniciar o teste. As condições aplicáveis após o período de teste, os limites de uso e a eventual restrição de funcionalidades devem ser conferidos na interface de contratação vigente.</p>
      <h2>3. Planos e pagamentos</h2>
      <p>Os preços, periodicidade, forma de pagamento, renovação e condições de cancelamento aplicáveis serão apresentados na tela de contratação antes da confirmação. A assinatura somente deve ser considerada concluída após a confirmação exibida pelo serviço ou pelo provedor de pagamento. Não publique este documento sem validar o fluxo de cobrança e completar as condições comerciais aplicáveis.</p>
      <h2>4. Cobranças e WhatsApp</h2>
      <p>O Critical Cash pode preparar mensagens e abrir links oficiais do WhatsApp para que o usuário revise e confirme o envio. O serviço não deve ser entendido como autorização para envio indiscriminado, spam, assédio ou cobrança abusiva. O usuário é responsável por verificar a legitimidade da cobrança e cumprir a legislação aplicável, inclusive as normas de proteção do consumidor.</p>
      <h2>5. Responsabilidades do usuário</h2>
      <p>O usuário é responsável pela legitimidade, exatidão e atualização dos dados inseridos, por possuir base legal para tratar dados pessoais de terceiros e por proteger suas credenciais. Não insira dados que não tenha autorização para tratar.</p>
      <h2>6. Disponibilidade e limitações</h2>
      <p>Empregamos esforços razoáveis para manter o serviço disponível, mas não garantimos operação ininterrupta nem ausência de erros. Mantenha cópias próprias dos dados relevantes e confira informações antes de tomar decisões financeiras.</p>
      <h2>7. Privacidade e contato</h2>
      <p>O tratamento de dados é descrito na <a href="/privacidade">Política de Privacidade</a>. Para dúvidas, entre em contato pelo e-mail criticalcash2026@gmail.com.</p>
    </LegalPage>
  ),
});
