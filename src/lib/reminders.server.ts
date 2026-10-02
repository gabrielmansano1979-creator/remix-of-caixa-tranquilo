// Server-only: lógica de envio da régua (cron diário) e e-mails do sistema.
import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl, fromAddress, reminderEmail, sendResend, signUnsub, systemEmail } from "./email.server";

type Admin = SupabaseClient<any>;
const todaySP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const daysBetween = (a: string, b: string) => Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000);

export async function emailsUsedThisMonth(admin: Admin, userId: string) {
  const now = new Date(todaySP() + "T00:00:00-03:00");
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10) + "T03:00:00Z";
  const { count } = await admin.from("reminder_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "sent").gte("sent_at", start);
  return count ?? 0;
}

/** Envia um lembrete e grava o log. Idempotência da régua via UNIQUE(entry_id, rule_id). */
export async function sendOne(admin: Admin, args: {
  profile: { user_id: string; business_name: string | null; reply_to_email: string | null };
  entry: { id: string; description: string; amount_cents: number; due_date: string; counterparty_name: string | null; counterparty_email: string };
  rule: { id: string | null; subject_tpl: string; body_tpl: string; offset_days: number };
  manual?: boolean;
}) {
  const { profile, entry, rule } = args;
  if (rule.id) {
    // Reserva o slot antes de enviar (evita envio duplo em execuções concorrentes).
    const { error } = await admin.from("reminder_logs").insert({ user_id: profile.user_id, entry_id: entry.id, rule_id: rule.id, sent_to: entry.counterparty_email, status: "failed", error: "pending" });
    if (error) return { skipped: true };
  }
  const unsub = `${appUrl()}/api/public/unsubscribe?t=${encodeURIComponent(signUnsub(profile.user_id, entry.counterparty_email))}`;
  const mail = reminderEmail({
    subjectTpl: rule.subject_tpl, bodyTpl: rule.body_tpl, offset: rule.offset_days, replyTo: profile.reply_to_email ?? "",
    vars: { cliente: entry.counterparty_name ?? "", valor: entry.amount_cents, vencimento: entry.due_date, descricao: entry.description, empresa: profile.business_name ?? "Nosso negócio" },
    unsubscribeUrl: unsub,
  });
  const r = await sendResend({
    from: fromAddress(profile.business_name), to: entry.counterparty_email, replyTo: profile.reply_to_email ?? undefined,
    subject: mail.subject, html: mail.html, text: mail.text,
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  });
  const row = { status: r.ok ? "sent" : "failed", provider_id: r.ok ? r.id : null, error: r.ok ? null : r.error, sent_at: new Date().toISOString() };
  if (rule.id) await admin.from("reminder_logs").update(row).eq("entry_id", entry.id).eq("rule_id", rule.id);
  else await admin.from("reminder_logs").insert({ ...row, user_id: profile.user_id, entry_id: entry.id, rule_id: null, manual: !!args.manual, sent_to: entry.counterparty_email });
  return r;
}

export async function runDailyReminders(admin: Admin) {
  const today = todaySP();
  const stats = { sent: 0, failed: 0, skipped: 0, users: 0 };
  const { data: profiles } = await admin.from("profiles").select("user_id, business_name, reply_to_email, reminders_enabled").eq("reminders_enabled", true);
  for (const p of profiles ?? []) {
    const { data: acc } = await admin.rpc("get_access", { _user_id: p.user_id });
    const access = acc as { can_write: boolean; status: string; limits: { emails_per_month: number } } | null;
    if (!access?.can_write || !["trialing", "active", "past_due", "canceled"].includes(access.status)) continue;
    stats.users++;
    const [{ data: rules }, { data: entries }, { data: unsubs }] = await Promise.all([
      admin.from("reminder_rules").select("*").eq("user_id", p.user_id).eq("active", true),
      admin.from("entries").select("id, description, amount_cents, due_date, counterparty_name, counterparty_email").eq("user_id", p.user_id).eq("type", "income").eq("status", "pending").eq("reminders_muted", false).not("counterparty_email", "is", null),
      admin.from("unsubscribed_emails").select("email").eq("user_id", p.user_id),
    ]);
    if (!rules?.length || !entries?.length) continue;
    const blocked = new Set((unsubs ?? []).map((u) => u.email.toLowerCase()));
    let used = await emailsUsedThisMonth(admin, p.user_id);
    const quota = access.limits.emails_per_month;
    for (const e of entries) {
      if (blocked.has(e.counterparty_email.toLowerCase())) continue;
      const diff = daysBetween(today, e.due_date);
      const rule = rules.find((r) => r.offset_days === diff);
      if (!rule) continue;
      if (used >= quota) { stats.skipped++; continue; }
      const r = await sendOne(admin, { profile: p, entry: e, rule });
      if ("skipped" in r) { stats.skipped++; continue; }
      if (r.ok) { stats.sent++; used++; } else stats.failed++;
    }
  }
  return stats;
}

/** E-mails do sistema: boas-vindas, trial acabando (2 dias), trial encerrado. */
export async function runSystemEmails(admin: Admin) {
  const url = appUrl();
  const { data: profiles } = await admin.from("profiles").select("user_id, trial_ends_at, welcome_sent, trial_warn_sent, trial_end_sent, notify_product_emails");
  for (const p of profiles ?? []) {
    const { data: u } = await admin.auth.admin.getUserById(p.user_id);
    const email = u?.user?.email;
    if (!email) continue;
    const { data: sub } = await admin.from("subscriptions").select("status, stripe_subscription_id").eq("user_id", p.user_id).maybeSingle();
    const subscribed = !!sub?.stripe_subscription_id && sub.status === "active";
    const ends = Date.parse(p.trial_ends_at);
    const send = async (kind: Parameters<typeof systemEmail>[0], flag: string) => {
      const m = systemEmail(kind, url);
      const r = await sendResend({ from: fromAddress("Caixa Crítico"), to: email, subject: m.subject, html: m.html, text: m.text });
      if (r.ok) await admin.from("profiles").update({ [flag]: true }).eq("user_id", p.user_id);
    };
    if (!p.welcome_sent) await send("welcome", "welcome_sent");
    if (subscribed || !p.notify_product_emails) continue;
    if (!p.trial_warn_sent && ends - Date.now() < 2.5 * 86400000 && ends > Date.now()) await send("trial_ending", "trial_warn_sent");
    if (!p.trial_end_sent && ends <= Date.now()) await send("trial_ended", "trial_end_sent");
  }
}

export async function sendSystemTo(admin: Admin, userId: string, kind: Parameters<typeof systemEmail>[0]) {
  const { data: u } = await admin.auth.admin.getUserById(userId);
  if (!u?.user?.email) return;
  const m = systemEmail(kind, appUrl());
  await sendResend({ from: fromAddress("Caixa Crítico"), to: u.user.email, subject: m.subject, html: m.html, text: m.text });
}
