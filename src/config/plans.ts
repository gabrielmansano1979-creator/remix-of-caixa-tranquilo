// Fonte única dos planos comerciais. Os limites de cliente espelham public.plan_limits no Supabase.
export type PlanId = "starter" | "pro" | "business";

export interface PlanConfig {
  id: PlanId;
  name: string;
  popular?: boolean;
  priceMonthCents: number;
  priceYearCents: number;
  couponDiscountPercent: number;
  limits: {
    pendingEntries: number;
    csvRows: number;
    topRisks: number;
    editRuleDays: boolean;
    editRuleTexts: boolean;
  };
  features: string[];
}

export type AccountantPlanId = "auditor_free" | "office_starter" | "office_pro" | "office_multiple";
export interface AccountantPlanConfig {
  id: AccountantPlanId;
  name: string;
  priceMonthCents: number;
  priceYearCents: number | null;
  popular?: boolean;
  features: string[];
}

// O sistema mantém limites técnicos inteiros no banco; 2.147.483.647 representa
// capacidade ilimitada para as validações existentes baseadas em INTEGER.
const UNLIMITED = 2_147_483_647;

export const TRIAL_DAYS = 14;
export const FIRST_PIX_DISCOUNT = 0.1;
export const PARTNER_COUPON_DISCOUNT = 0.2;
export const TRIAL_PLAN: PlanId = "pro";
export const USAGE_WARNING_RATIO = 0.8;

export const PLANS: PlanConfig[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthCents: 5900,
    priceYearCents: 59000,
    couponDiscountPercent: PARTNER_COUPON_DISCOUNT * 100,
    limits: { pendingEntries: UNLIMITED, csvRows: UNLIMITED, topRisks: UNLIMITED, editRuleDays: true, editRuleTexts: true },
    features: [
      "Lançamentos, entradas e saídas ilimitados",
      "Anexos de comprovantes em PDF e fotos",
      "Semáforo de auditoria financeira",
      "Cobranças e lembretes via WhatsApp Direct",
      "Importação de movimentações financeiras",
      "Cupom de contador parceiro com 20% de desconto",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    popular: true,
    priceMonthCents: 9900,
    priceYearCents: 99000,
    couponDiscountPercent: PARTNER_COUPON_DISCOUNT * 100,
    limits: { pendingEntries: UNLIMITED, csvRows: UNLIMITED, topRisks: UNLIMITED, editRuleDays: true, editRuleTexts: true },
    features: [
      "Tudo do Starter",
      "Projeção preditiva de caixa para 30 dias",
      "Identificação da data projetada de saldo negativo (Data do Furo)",
      "Importação bancária OFX, CSV e PDF",
      "Central de pendências financeiras",
      "Lançamentos e importações ilimitados",
      "Cupom de contador parceiro com 20% de desconto",
    ],
  },
  {
    id: "business",
    name: "Business",
    priceMonthCents: 19900,
    priceYearCents: 199000,
    couponDiscountPercent: PARTNER_COUPON_DISCOUNT * 100,
    limits: { pendingEntries: UNLIMITED, csvRows: UNLIMITED, topRisks: UNLIMITED, editRuleDays: true, editRuleTexts: true },
    features: [
      "Tudo do Pro",
      "Leitura automática OCR de comprovantes com Tesseract.js e PDF.js",
      "Múltiplos usuários",
      "Suporte prioritário",
      "Lançamentos e importações ilimitados",
      "Cupom de contador parceiro com 20% de desconto",
    ],
  },
];

export const ACCOUNTANT_PLANS: AccountantPlanConfig[] = [
  {
    id: "auditor_free",
    name: "Auditor Free",
    priceMonthCents: 0,
    priceYearCents: null,
    features: [
      "Gratuito para sempre: auditoria de clientes sem limite",
      "Área Meus Clientes completa, sem exigir plano de escritório",
      "Semáforos vermelho, amarelo e verde por lançamento",
      "Visualização e conferência de comprovantes anexados pelos clientes",
      "Pendências e cobrança de documentos pelo WhatsApp Direct",
      "Relatórios e acompanhamento de auditoria gratuitos",
      "Painel de comissões e cupom de contador parceiro com 20% de desconto",
    ],
  },
  {
    id: "office_starter",
    name: "Escritório Starter",
    priceMonthCents: 14900,
    priceYearCents: 149000,
    features: [
      "Todos os recursos gratuitos de Meus Clientes e auditoria",
      "Libera a área paga Meu Caixa para a própria empresa contábil",
      "Fluxo de caixa do escritório, entradas, saídas e saldo",
      "DRE simplificada",
    ],
  },
  {
    id: "office_pro",
    name: "Escritório Pro",
    priceMonthCents: 24900,
    priceYearCents: 249000,
    features: [
      "Todos os recursos gratuitos de Meus Clientes e auditoria",
      "Tudo do Meu Caixa do Escritório Starter",
      "Gestão financeira completa do próprio escritório",
      "Projeção preditiva de caixa para 30 dias",
      "Importação bancária OFX e PDF",
    ],
  },
  {
    id: "office_multiple",
    name: "Escritório Múltiplo",
    priceMonthCents: 39900,
    priceYearCents: 399000,
    features: [
      "Todos os recursos gratuitos de Meus Clientes e auditoria",
      "Tudo do Meu Caixa do Escritório Pro",
      "Múltiplos CNPJs e filiais contábeis",
      "Gestão de honorários dos clientes",
      "Atendimento VIP",
    ],
  },
];

export const formatPlanPrice = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export const getPlan = (id: PlanId) => {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error("Plano inválido");
  return plan;
};

// Valores do Stripe são mantidos por compatibilidade, mas o fluxo de cobrança principal
// documentado usa Asaas. Substitua pelos IDs reais se o Stripe voltar a ser utilizado.
export const STRIPE_PRICE_IDS: Record<PlanId, { month: string; year: string }> = {
  starter: { month: "price_starter_month_REPLACE", year: "price_starter_year_REPLACE" },
  pro: { month: "price_pro_month_REPLACE", year: "price_pro_year_REPLACE" },
  business: { month: "price_business_month_REPLACE", year: "price_business_year_REPLACE" },
};
