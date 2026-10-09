// Server-only: lógica de envio da régua (cron diário) e e-mails do sistema.
import type { SupabaseClient } from "@supabase/supabase-js";
import { appUrl, fromAddress, renderTpl, sendResend, systemEmail } from "./email.server";
import { sendWhatsApp } from "./whatsapp.server";


type Admin = SupabaseClient<any>;
const todaySP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const daysBetween = (a: string, b: string) => Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000);

export async function emailsUsedThisMonth(admin: Admin, userId: string) {
  const now = new Date(todaySP() + "T00:00:00-03:00");
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10) + "T03:00:00Z";
  const { count } = await admin.from("reminder_logs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "sent").gte("sent_at", start);
  return count ?? 0;
}

type Channel = 'email' | 'whatsapp';
type ReminderArgs = {
 profile: { user_id: string; business_name: string | null; reply_to_email: string | null };
 entry: { id: string; description: string; amount_cents: number; due_date: string; counterparty_name: string | null; counterparty_whatsapp?: string | null; counterparty_email?: string | null; pix_url?: string | null };
 rule: { id: string | null; subject_tpl: string; body_tpl: string; offset_days: number; channel?: string };
 manual?: boolean; channel?: Channel;
};
/** One delivery per channel, independently claimed before contacting a provider. */
export async function sendOne(admin: Admin, args: ReminderArgs) {
 const { profile, entry, rule } = args;
 const channel = args.channel ?? 'whatsapp';
 const to = channel === 'email' ? entry.counterparty_email : entry.counterparty_whatsapp;
 if (!to) return { skipped: true as const };
 const { data: blocked } = await admin.from('unsubscribed_emails').select('email').eq('user_id',profile.user_id).eq('email',to.toLowerCase()).maybeSingle();
 if (blocked) return { skipped: true as const };
 const { data: claim, error: claimError } = await admin.from('reminder_logs').insert({user_id:profile.user_id,entry_id:entry.id,rule_id:null,stage_rule_id:rule.id,channel,sent_to:to,status:'failed',error:'pending',manual:!!args.manual}).select('id').single();
 if (claimError || !claim) return { skipped: true as const };
 const empresa = profile.business_name ?? 'Nosso negócio';
 const vars = {cliente:entry.counterparty_name ?? '',valor:entry.amount_cents,vencimento:entry.due_date,descricao:entry.description,empresa,link_pix:entry.pix_url ?? ''};
 let r: {ok:true;id:string|null} | {ok:false;error:string};
 try {
   if(channel === 'email') {
     const { reminderEmail, signUnsub } = await import('./email.server');
     const m = reminderEmail({subjectTpl:rule.subject_tpl,bodyTpl:rule.body_tpl,offset:rule.offset_days,vars,replyTo:profile.reply_to_email ?? '',unsubscribeUrl:appUrl()+'/api/public/unsubscribe?token='+encodeURIComponent(signUnsub(profile.user_id,to))});
     r = await sendResend({from:fromAddress(empresa),to,replyTo:profile.reply_to_email ?? undefined,...m});
   } else {
     const text = `*${renderTpl(rule.subject_tpl,vars,false)}*\n\n${renderTpl(rule.body_tpl,vars,false)}\n\n_Mensagem automática de ${empresa}. Responda SAIR para não receber mais lembretes._`;
     r = await sendWhatsApp(to,text);
   }
 } catch { r = {ok:false,error:'Serviço de envio indisponível.'}; }
 await admin.from('reminder_logs').update({status:r.ok?'sent':'failed',provider_id:r.ok?r.id:null,delivery_status:r.ok?'accepted':null,error:r.ok?null:r.error,sent_at:new Date().toISOString()}).eq('id',claim.id);
 return r;
}

export async function runDailyReminders(admin: Admin) {
 const today = todaySP(); const stats = {sent:0,failed:0,skipped:0,users:0};
 const {data:profiles} = await admin.from('profiles').select('user_id,business_name,reply_to_email,reminders_enabled').eq('reminders_enabled',true);
 for(const p of profiles ?? []) {
   const {data:acc} = await admin.rpc('get_access',{_user_id:p.user_id});
   const access = acc as {can_write:boolean;plan:string;limits:{emails_per_month:number}} | null;
   if(!access?.can_write) continue;
   stats.users++;
   const [{data:rules},{data:entries}] = await Promise.all([
     admin.from('reminder_rules').select('*').eq('user_id',p.user_id).eq('active',true),
     admin.from('entries').select('id,description,amount_cents,due_date,counterparty_name,counterparty_whatsapp,counterparty_email,pix_url').eq('user_id',p.user_id).eq('type','income').eq('status','pending').eq('reminders_muted',false)
   ]);
   let used = await emailsUsedThisMonth(admin,p.user_id);
   for(const e of entries ?? []) {
     const matching = (rules ?? []).filter(r=>r.offset_days===daysBetween(today,e.due_date));
     for(const rule of matching) {
       const channels: Channel[] = access.plan==='starter' ? ['email'] : rule.channel==='both' ? ['email','whatsapp'] : [rule.channel==='email'?'email':'whatsapp'];
       for(const channel of channels) {
         if(used >= access.limits.emails_per_month) {stats.skipped++;continue;}
         const r = await sendOne(admin,{profile:p,entry:e,rule,channel});
         if('skipped' in r) stats.skipped++; else if(r.ok) {stats.sent++;used++;} else stats.failed++;
       }
     }
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
      const r = await sendResend({ from: fromAddress("Critical Cash"), to: email, subject: m.subject, html: m.html, text: m.text });
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
  await sendResend({ from: fromAddress("Critical Cash"), to: u.user.email, subject: m.subject, html: m.html, text: m.text });
}
