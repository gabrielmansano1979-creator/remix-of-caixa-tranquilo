// Server-only: Resend, templates HTML e tokens HMAC de descadastro.
import { createHmac, timingSafeEqual } from "node:crypto";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const brl = (c: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(c / 100);
const dt = (iso: string) => iso.split("-").reverse().join("/");

export interface TplVars { cliente: string; valor: number; vencimento: string; descricao: string; empresa: string }

/** Substitui variáveis com valores ESCAPADOS (o template em si também é escapado). */
export function renderTpl(tpl: string, v: TplVars, html: boolean) {
  const map: Record<string, string> = { cliente: v.cliente || "cliente", valor: brl(v.valor), vencimento: dt(v.vencimento), descricao: v.descricao, empresa: v.empresa };
  const base = html ? esc(tpl) : tpl;
  return base.replace(/\{\{\s*(cliente|valor|vencimento|descricao|empresa)\s*\}\}/g, (_m, k: string) => (html ? `<strong>${esc(map[k] ?? "")}</strong>` : map[k] ?? ""));
}

const STAGES = {
  before: { color: "#0F766E", label: "Lembrete" },
  due: { color: "#0F766E", label: "Vence hoje" },
  late: { color: "#D97706", label: "Pagamento pendente" },
  firm: { color: "#DC2626", label: "Pagamento em atraso" },
};
export const stageFor = (offset: number) => (offset < 0 ? STAGES.before : offset === 0 ? STAGES.due : offset < 7 ? STAGES.late : STAGES.firm);

export function layout({ heading, color, bodyHtml, footerHtml }: { heading: string; color: string; bodyHtml: string; footerHtml: string }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="height:6px;background:${color}"></td></tr>
<tr><td style="padding:28px 28px 8px"><p style="margin:0;font-size:13px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:.04em">${esc(heading)}</p></td></tr>
<tr><td style="padding:8px 28px 24px;font-size:15px;line-height:1.6">${bodyHtml}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">${footerHtml}</td></tr>
</table></td></tr></table></body></html>`;
}

export function reminderEmail(opts: { subjectTpl: string; bodyTpl: string; offset: number; vars: TplVars; replyTo: string; unsubscribeUrl: string }) {
  const st = stageFor(opts.offset);
  const paragraphs = renderTpl(opts.bodyTpl, opts.vars, true).split(/\n{2,}|\n/).map((p) => `<p style="margin:0 0 12px">${p}</p>`).join("");
  const footer = `Enviado por <strong>${esc(opts.vars.empresa)}</strong> via Critical Cash. Dúvidas? Responda este e-mail (${esc(opts.replyTo)}).<br>Já pagou? Desconsidere esta mensagem.<br><a href="${esc(opts.unsubscribeUrl)}" style="color:#64748b">Não quero mais receber lembretes</a>`;
  return {
    subject: renderTpl(opts.subjectTpl, opts.vars, false).slice(0, 200),
    html: layout({ heading: st.label, color: st.color, bodyHtml: paragraphs, footerHtml: footer }),
    text: renderTpl(opts.bodyTpl, opts.vars, false) + `\n\n—\nPara não receber mais lembretes: ${opts.unsubscribeUrl}`,
  };
}

export type SystemEmail = "welcome" | "trial_ending" | "trial_ended" | "payment_failed" | "subscription_confirmed";
const SYS: Record<SystemEmail, { subject: string; heading: string; body: string; cta: string; path: string }> = {
  welcome: { subject: "Bem-vindo ao Critical Cash", heading: "Boas-vindas", body: "Sua conta está pronta e você tem 7 dias grátis com tudo do plano Pro. Cadastre suas primeiras contas e veja em segundos se o caixa fecha.", cta: "Abrir meu caixa", path: "/caixa" },
  trial_ending: { subject: "Seu teste grátis acaba em 2 dias", heading: "Faltam 2 dias", body: "Seu teste termina em 2 dias. Escolha um plano para manter a projeção e os lembretes automáticos funcionando.", cta: "Escolher plano", path: "/planos" },
  trial_ended: { subject: "Seu teste grátis terminou", heading: "Teste encerrado", body: "Sua conta está em modo somente leitura e os lembretes estão pausados. Seus dados ficam guardados por 90 dias.", cta: "Assinar agora", path: "/planos" },
  payment_failed: { subject: "Não conseguimos processar seu pagamento", heading: "Pagamento não aprovado", body: "Houve um problema com a cobrança da sua assinatura. Atualize seu pagamento em até 7 dias para não perder o acesso.", cta: "Atualizar pagamento", path: "/assinatura" },
  subscription_confirmed: { subject: "Assinatura confirmada", heading: "Tudo certo", body: "Sua assinatura está ativa. Obrigado por confiar no Critical Cash!", cta: "Ver assinatura", path: "/assinatura" },
};

export function systemEmail(kind: SystemEmail, appUrl: string) {
  const s = SYS[kind];
  const body = `<p style="margin:0 0 20px">${esc(s.body)}</p><a href="${esc(appUrl + s.path)}" style="display:inline-block;background:#0F766E;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">${esc(s.cta)}</a>`;
  return { subject: s.subject, html: layout({ heading: s.heading, color: "#0F766E", bodyHtml: body, footerHtml: "Critical Cash · E-mail sobre a sua conta." }), text: `${s.body}\n\n${appUrl + s.path}` };
}

export async function sendResend(p: { from: string; to: string; replyTo?: string; subject: string; html: string; text: string; headers?: Record<string, string> }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false as const, error: "RESEND_API_KEY não configurada" };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: p.from, to: [p.to], reply_to: p.replyTo, subject: p.subject, html: p.html, text: p.text, headers: p.headers }),
    });
    const j = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!r.ok) return { ok: false as const, error: (j.message ?? `HTTP ${r.status}`).slice(0, 300) };
    return { ok: true as const, id: j.id ?? null };
  } catch (e) {
    return { ok: false as const, error: String(e).slice(0, 300) };
  }
}

export const fromAddress = (name?: string | null) => {
  const email = process.env.RESEND_FROM_EMAIL ?? "cobranca@example.com";
  const safe = (name || "Critical Cash").replace(/[<>"\r\n]/g, "").slice(0, 60);
  return `${safe} <${email}>`;
};
export const appUrl = () => (process.env.APP_URL ?? "").replace(/\/$/, "");

const secret = () => {
  const s = process.env.HMAC_SECRET;
  if (!s) throw new Error("HMAC_SECRET ausente");
  return s;
};
export function signUnsub(userId: string, email: string) {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: email.toLowerCase() })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}
export function verifyUnsub(token: string): { u: string; e: string } | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const exp = createHmac("sha256", secret()).update(payload).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== exp.length || !timingSafeEqual(got, exp)) return null;
  try { return JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { return null; }
}
