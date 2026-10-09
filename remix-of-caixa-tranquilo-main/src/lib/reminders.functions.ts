import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Res = { ok: boolean; message: string };

/** "Cobrar agora": envio manual. Rate limit: 1 por conta a cada 24h e 20 por hora por usuário. */
export const sendNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ entryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<Res> => {
    const { supabase, userId } = context;
    const { data: acc } = await supabase.rpc("my_access");
    const access = acc as { can_write: boolean; plan: string; limits: { emails_per_month: number } } | null;
    if (!access?.can_write) return { ok: false, message: "Conta em modo somente leitura. Assine para enviar cobranças." };
    const { data: entry } = await supabase.from("entries").select("*").eq("id", data.entryId).maybeSingle();
    if (!entry || entry.type !== "income" || entry.status !== "pending" || (!entry.counterparty_whatsapp && !entry.counterparty_email)) return { ok: false, message: "Cadastre o e-mail ou WhatsApp do cliente para cobrar esta conta." };
    const channel = access.plan === "starter" || !entry.counterparty_whatsapp ? "email" as const : "whatsapp" as const;
    const recipient = channel === "email" ? entry.counterparty_email : entry.counterparty_whatsapp;
    if (!recipient) return { ok: false, message: "O plano Starter envia por e-mail. Cadastre o e-mail do cliente." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { emailsUsedThisMonth, sendOne } = await import("./reminders.server");
    const since24 = new Date(Date.now() - 86400000).toISOString();
    const since1h = new Date(Date.now() - 3600000).toISOString();
    const [{ count: c24 }, { count: c1h }, { data: unsub }] = await Promise.all([
      supabaseAdmin.from("reminder_logs").select("id", { count: "exact", head: true }).eq("entry_id", entry.id).eq("manual", true).gte("sent_at", since24),
      supabaseAdmin.from("reminder_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("manual", true).gte("sent_at", since1h),
      supabaseAdmin.from("unsubscribed_emails").select("email").eq("user_id", userId).eq("email", recipient.toLowerCase()).maybeSingle(),
    ]);
    if ((c24 ?? 0) > 0) return { ok: false, message: "Você já cobrou esta conta nas últimas 24h." };
    if ((c1h ?? 0) >= 20) return { ok: false, message: "Muitos envios em pouco tempo. Tente daqui a pouco." };
    if (unsub) return { ok: false, message: "Este cliente pediu para não receber lembretes." };
    if ((await emailsUsedThisMonth(supabaseAdmin, userId)) >= access.limits.emails_per_month) return { ok: false, message: "Cota mensal de mensagens atingida. Faça upgrade." };
    const { data: profile } = await supabase.from("profiles").select("user_id, business_name, reply_to_email").eq("user_id", userId).single();
    const diff = Math.round((Date.now() - Date.parse(entry.due_date + "T12:00:00Z")) / 86400000);
    const { data: rules } = await supabase.from("reminder_rules").select("*").order("offset_days");
    const rule = [...(rules ?? [])].reverse().find((r) => r.offset_days <= diff) ?? rules?.[0];
    if (!rule || !profile) return { ok: false, message: "Régua não encontrada." };
    const r = await sendOne(supabaseAdmin, { profile, entry: { ...entry, counterparty_whatsapp: entry.counterparty_whatsapp }, rule: { ...rule, id: null }, manual: true, channel });
    await supabaseAdmin.from("audit_logs").insert({ user_id: userId, action: "manual_reminder", meta: { entry_id: entry.id } });
    return "ok" in r && r.ok ? { ok: true, message: `Cobrança enviada por ${channel === "email" ? "E-mail" : "WhatsApp"}.` } : { ok: false, message: "Não foi possível enviar. Confira a conexão do canal escolhido." };
  });

/** Envia um e-mail de teste da etapa escolhida para o próprio usuário (5/hora). */
export const sendTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ruleId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<Res> => {
    const { supabase, userId, claims } = context;
    const email = (claims as { email?: string }).email;
    if (!email) return { ok: false, message: "Sua conta não tem e-mail." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("audit_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("action", "test_email").gte("created_at", new Date(Date.now() - 3600000).toISOString());
    if ((count ?? 0) >= 5) return { ok: false, message: "Limite de 5 testes por hora." };
    const [{ data: rule }, { data: profile }] = await Promise.all([
      supabase.from("reminder_rules").select("*").eq("id", data.ruleId).maybeSingle(),
      supabase.from("profiles").select("business_name, reply_to_email").eq("user_id", userId).single(),
    ]);
    if (!rule || !profile) return { ok: false, message: "Etapa não encontrada." };
    const { reminderEmail, sendResend, fromAddress, appUrl } = await import("./email.server");
    const due = new Date(Date.now() - rule.offset_days * 86400000).toISOString().slice(0, 10);
    const m = reminderEmail({
      subjectTpl: "[TESTE] " + rule.subject_tpl, bodyTpl: rule.body_tpl, offset: rule.offset_days, replyTo: profile.reply_to_email ?? email,
      vars: { cliente: "Cliente Exemplo", valor: 150000, vencimento: due, descricao: "Serviço de exemplo", empresa: profile.business_name ?? "Seu negócio" },
      unsubscribeUrl: appUrl() + "/",
    });
    const r = await sendResend({ from: fromAddress(profile.business_name), to: email, replyTo: profile.reply_to_email ?? undefined, subject: m.subject, html: m.html, text: m.text });
    await supabaseAdmin.from("audit_logs").insert({ user_id: userId, action: "test_email", meta: { rule_id: rule.id, ok: r.ok } });
    return r.ok ? { ok: true, message: `Teste enviado para ${email}.` } : { ok: false, message: "Envio indisponível: o serviço de e-mail ainda não foi configurado." };
  });
