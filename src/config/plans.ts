// Fonte única de planos e limites no front. Espelho do servidor: função SQL public.plan_limits.
export type PlanId = "starter" | "pro" | "business";

export interface PlanConfig {
  id: PlanId;
  name: string;
  popular?: boolean;
  priceMonthCents: number;
  priceYearCents: number;
  limits: {
    pendingEntries: number;
    csvRows: number;
    topRisks: number;
    editRuleDays: boolean;
    editRuleTexts: boolean;
  };
  features: string[];
}

export const TRIAL_DAYS = 14; // teste sem cartão, com recursos Pro
/** Desconto da primeira assinatura paga via Pix. */
export const FIRST_PIX_DISCOUNT = 0.1;
export const TRIAL_PLAN: PlanId = "pro";
export const USAGE_WARNING_RATIO = 0.8;

export const PLANS: PlanConfig[] = [
  {
    id: "starter",
    name: "Essencial",
    priceMonthCents: 7990,
    priceYearCents: 79900,
    limits: { pendingEntries: 100, csvRows: 100, topRisks: 3, editRuleDays: false, editRuleTexts: false },
    features: [
      "Até 100 contas pendentes",
      "Cobranças manuais pelo WhatsApp",
      "Importação CSV (até 100 linhas)",
      "Régua padrão com 4 etapas",
      "Projeção de 15 e 30 dias",
      "Top 3 maiores riscos",
      "Suporte padrão",
    ],
  },
  {
    id: "pro",
    name: "Evolução",
    popular: true,
    priceMonthCents: 15990,
    priceYearCents: 159900,
    limits: { pendingEntries: 500, csvRows: 500, topRisks: 5, editRuleDays: true, editRuleTexts: false },
    features: [
      "Até 500 contas pendentes",
      "Cobranças manuais pelo WhatsApp",
      "Importação CSV (até 500 linhas)",
      "Edite dias e ative/desative etapas",
      "Projeção de 15 e 30 dias",
      "Top 5 maiores riscos",
      "Suporte prioritário",
    ],
  },
  {
    id: "business",
    name: "Excelência",
    priceMonthCents: 24990,
    priceYearCents: 249900,
    limits: { pendingEntries: 2000, csvRows: 2000, topRisks: 10, editRuleDays: true, editRuleTexts: true },
    features: [
      "Até 2.000 contas pendentes",
      "Cobranças manuais pelo WhatsApp",
      "Importação CSV (até 2.000 linhas)",
      "Edite mensagens e etapas da régua",
      "Projeção de 15 e 30 dias",
      "Top 10 maiores riscos",
      "Suporte prioritário",
    ],
  },
];

export const getPlan = (id: PlanId) => {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error("Plano inválido");
  return plan;
};

// IDs de preço do Stripe (modo teste). Substitua pelos IDs criados no seu painel Stripe.
// Também podem ser sobrescritos no servidor pelos secrets STRIPE_PRICE_<PLANO>_<MONTH|YEAR>.
export const STRIPE_PRICE_IDS: Record<PlanId, { month: string; year: string }> = {
  starter: { month: "price_starter_month_REPLACE", year: "price_starter_year_REPLACE" },
  pro: { month: "price_pro_month_REPLACE", year: "price_pro_year_REPLACE" },
  business: { month: "price_business_month_REPLACE", year: "price_business_year_REPLACE" },
};
