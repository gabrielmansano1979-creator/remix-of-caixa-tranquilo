// Camada de analytics trocável. Conecte PostHog/GA implementando `provider`.
export type AnalyticsEvent = "signup" | "first_entry" | "csv_import" | "first_reminder" | "upgrade_click" | "subscription_cancel" | "onboarding_done";

type Provider = (event: AnalyticsEvent, props?: Record<string, unknown>) => void;

let provider: Provider = (event, props) => {
  if (import.meta.env.DEV) console.debug("[analytics]", event, props ?? {});
  // Exemplo PostHog: window.posthog?.capture(event, props)
  // Exemplo GA4:     window.gtag?.("event", event, props)
};

export const setAnalyticsProvider = (p: Provider) => { provider = p; };
export const track = (event: AnalyticsEvent, props?: Record<string, unknown>) => {
  try { provider(event, props); } catch { /* nunca quebra a UI */ }
};
