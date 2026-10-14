import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, FileUp, PencilLine, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { profileQuery, entriesQuery, todaySP, addDays } from "@/lib/app-data";
import { saveFirstEntries } from "@/lib/onboarding.functions";
import { toE164 } from "@/lib/phone";
import { formatBRL, formatDate } from "@/lib/format";
import { Logo } from "@/components/brand";
import { MoneyInput } from "@/components/money-input";
import { CsvImportDialog } from "@/components/contas/csv-import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

export const Route = createFileRoute("/_authenticated/onboarding")({
 head: () => ({ meta: [{ title: "Seus primeiros 90 segundos — Critical Cash" }, { name: "description", content: "Configure seu negócio e ative a previsão de caixa em três passos, sem cartão." }, { property: "og:title", content: "Primeiros passos — Critical Cash" }, { property: "og:description", content: "Seu caixa em três passos, com 7 dias grátis." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
 loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery),
 pendingComponent: () => <Skeleton className="mx-auto mt-10 h-96 max-w-xl" />,
 errorComponent: () => <p role="alert" className="p-8 text-danger">Não foi possível carregar. Recarregue a página.</p>,
 component: Onboarding,
});
function Onboarding() {
 const { user } = Route.useRouteContext();
 const { data: profile } = useSuspenseQuery(profileQuery);
 const qc = useQueryClient(); const navigate = useNavigate(); const saveEntries = useServerFn(saveFirstEntries);
 const [step,setStep] = useState(profile?.business_name && profile?.notification_whatsapp ? 2 : 1);
 const [name,setName] = useState(profile?.full_name ?? user.user_metadata?.full_name ?? "");
 const [business,setBusiness] = useState(profile?.business_name ?? ""); const [phone,setPhone] = useState(profile?.notification_whatsapp ?? "");
 const [balance,setBalance] = useState(profile?.initial_balance_cents ?? 0);
 const blank = { description: "", amount_cents: 0, due_date: addDays(todaySP(),7), counterparty_name: "", counterparty_whatsapp: "" };
 const [expense,setExpense] = useState(blank); const [income,setIncome] = useState(blank);
 const [mode,setMode] = useState<'manual'|'csv'|null>(null); const [csv,setCsv] = useState(false); const [busy,setBusy] = useState(false); const [error,setError] = useState("");
 const entries = useQuery(entriesQuery);
 const projection = useQuery({ queryKey: ['projection'], enabled: step === 3, queryFn: async () => { const { data,error } = await supabase.rpc('cash_projection',{ _days: 30 }); if(error) throw error; return data as unknown as { status: 'green'|'yellow'|'red'; min_balance: number; min_date: string; series: {date:string;balance:number}[] }; } });
 const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); try { await action(); } catch { setError('Não foi possível salvar. Confira os dados e tente novamente.'); } finally { setBusy(false); } };
 const saveProfile = () => run(async () => {
   const parsed = z.object({ full_name:z.string().trim().min(2).max(120), business_name:z.string().trim().min(2).max(120), notification_whatsapp:z.string().regex(/^\+[1-9][0-9]{9,14}$/) }).safeParse({ full_name:name,business_name:business,notification_whatsapp:toE164(phone) ?? '' });
   if(!parsed.success) { setError('Informe nome, negócio e WhatsApp com DDD válidos.'); return; }
   const { data: updatedProfile, error } = await supabase.from('profiles').update(parsed.data).eq('user_id',user.id).select('user_id').maybeSingle();
   if(error) { console.error('[Onboarding] Falha ao salvar perfil:', error); throw error; }
   if(!updatedProfile) throw new Error('Nenhum perfil foi atualizado para este usuário.');
   await qc.invalidateQueries({queryKey:['profile']}); setStep(2);
 });
 const next = () => run(async () => {
   if(mode === 'csv') { if(!entries.data?.length) { setError('Importe pelo menos uma conta antes de continuar.'); return; } const {data: updatedProfile,error} = await supabase.from('profiles').update({ initial_balance_cents: balance }).eq('user_id',user.id).select('user_id').maybeSingle(); if(error) { console.error('[Onboarding] Falha ao salvar saldo:',error); throw error; } if(!updatedProfile) throw new Error('Nenhum perfil foi atualizado ao salvar o saldo.'); }
   else { if(!expense.description.trim() || !income.description.trim() || expense.amount_cents <= 0 || income.amount_cents <= 0) { setError('Informe descrição, valor e vencimento das duas contas.'); return; } const r = await saveEntries({data:{balance,expense,income:{...income,counterparty_whatsapp:toE164(income.counterparty_whatsapp) ?? ''}}}); if(!r.ok) { setError(r.message); return; } }
   await qc.invalidateQueries({queryKey:['entries']}); await qc.invalidateQueries({queryKey:['projection']}); setStep(3);
 });
 const finish = () => run(async () => { const {data: updatedProfile,error} = await supabase.from('profiles').update({onboarding_done:true}).eq('user_id',user.id).select('user_id').maybeSingle(); if(error) { console.error('[Onboarding] Falha ao concluir onboarding:',error); throw error; } if(!updatedProfile) throw new Error('Nenhum perfil foi atualizado ao concluir o onboarding.'); await qc.invalidateQueries({queryKey:['profile']}); toast.success('Seu caixa está pronto.'); const referralCode = user.user_metadata?.affiliate_referral_code; if (typeof referralCode === 'string' && referralCode) await navigate({to:'/planos', search:{ref:referralCode}}); else await navigate({to:'/caixa'}); });
 return <main className="min-h-screen bg-background px-5 py-8"><div className="mx-auto max-w-2xl"><Logo /><div className="mt-8 flex items-center justify-between text-sm"><span>Passo {step} de 3</span><span className="text-muted-foreground">7 dias grátis · Sem cartão</span></div><Progress className="mt-3 h-2" value={step/3*100} /><div className="mt-8 space-y-6">
 {step===1 ? <><h1 className="text-3xl font-semibold">Conte sobre seu negócio.</h1>{[["Seu nome",name,setName],["Nome do negócio",business,setBusiness],["WhatsApp do negócio",phone,setPhone]].map(([label,value,set],i) => <div key={String(label)}><Label htmlFor={'profile-'+i}>{String(label)}</Label><Input id={'profile-'+i} type={i===2?'tel':'text'} value={String(value)} maxLength={i===2?25:120} onChange={e => (set as (v:string)=>void)(e.target.value)} className="mt-2 min-h-11" /></div>)}<Button disabled={busy} className="min-h-12 w-full" onClick={saveProfile}>Continuar<ArrowRight className="ml-2 h-4 w-4" /></Button></> : step===2 ? <><h1 className="text-3xl font-semibold">Traga seus primeiros números.</h1><div><Label htmlFor="balance">Saldo atual</Label><MoneyInput id="balance" value={balance} onChange={setBalance} allowNegative /></div><div className="grid gap-3 sm:grid-cols-2"><Button variant={mode==='csv'?'default':'outline'} className="min-h-14 whitespace-normal" onClick={()=>{setMode('csv');setCsv(true);}}><FileUp className="mr-2 h-5 w-5 shrink-0" />Importar arquivo PDF, CSV ou Excel</Button><Button variant={mode==='manual'?'default':'outline'} className="min-h-14 whitespace-normal" onClick={()=>setMode('manual')}><PencilLine className="mr-2 h-5 w-5 shrink-0" />Inserir 3 lançamentos manualmente</Button></div>
 {mode==='manual' && <div className="grid gap-6 sm:grid-cols-2">{([['Conta a pagar',expense,setExpense],['Conta a receber',income,setIncome]] as const).map(([title,value,set],i) => <section key={title} className="border-t pt-5"><h2 className="mb-5 font-semibold">{title}</h2><div className="space-y-4"><div><Label htmlFor={'desc-'+i}>Descrição</Label><Input id={'desc-'+i} value={value.description} maxLength={200} onChange={e=>set({...value,description:e.target.value})} className="mt-2 min-h-11" /></div><div><Label htmlFor={'value-'+i}>Valor</Label><MoneyInput id={'value-'+i} value={value.amount_cents} onChange={v=>set({...value,amount_cents:v})} /></div><div><Label htmlFor={'due-'+i}>Vencimento</Label><Input id={'due-'+i} type="date" value={value.due_date} onChange={e=>set({...value,due_date:e.target.value})} className="mt-2 min-h-11" /></div>{i===1 && <>{([['counterparty_name','Nome do cliente'],['counterparty_whatsapp','WhatsApp do cliente (opcional)']] as const).map(([key,label])=><div key={key}><Label htmlFor={key}>{label}</Label><Input id={key} value={value[key]} maxLength={key==='counterparty_whatsapp'?25:120} onChange={e=>set({...value,[key]:e.target.value})} className="mt-2 min-h-11" /></div>)}</>}</div></section>)}</div>}
 {mode==='csv' && <p className="text-sm text-muted-foreground">{entries.data?.length ?? 0} conta(s) cadastrada(s).</p>}<Button disabled={busy || !mode} onClick={next} className="min-h-12 w-full">Ver meu semáforo<ArrowRight className="ml-2 h-4 w-4" /></Button></> : <><h1 className="text-3xl font-semibold">Seu caixa já tem uma previsão.</h1>{projection.isLoading ? <Skeleton className="h-64" /> : projection.isError ? <Button variant="outline" onClick={()=>projection.refetch()}>Tentar calcular novamente</Button> : projection.data && <><section className={`cash-reveal flex gap-4 rounded-lg p-5 ${projection.data.status==='red'?'bg-danger/10 text-danger':projection.data.status==='yellow'?'bg-warning/10 text-warning':'bg-success/10 text-success'}`}>{projection.data.status==='green'?<CheckCircle2 className="h-8 w-8 shrink-0" />:<AlertTriangle className="h-8 w-8 shrink-0" />}<div><h2 className="text-xl font-semibold">{projection.data.status==='red'?'Risco: caixa negativo':projection.data.status==='yellow'?'Atenção: caixa apertado':'Tudo certo: o caixa fecha'}</h2><p className="mt-2">Menor saldo de {formatBRL(projection.data.min_balance)} em {formatDate(projection.data.min_date)}.</p></div></section><div className="h-60 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={projection.data.series}><XAxis dataKey="date" tickFormatter={v=>formatDate(v).slice(0,5)} interval={6} /><YAxis hide /><Tooltip formatter={v=>formatBRL(Number(v))} labelFormatter={v=>formatDate(String(v))} /><Line dataKey="balance" stroke="var(--primary)" dot={false} strokeWidth={3} /></LineChart></ResponsiveContainer></div></>}
 <div className="border-y py-5"><p className="font-medium">Envio pelo WhatsApp</p><p className="mt-1 text-sm text-muted-foreground">As mensagens são preparadas para você revisar e enviar pelo WhatsApp Web ou aplicativo.</p></div><Button className="min-h-12 w-full" onClick={finish} disabled={busy || !projection.data}>Abrir meu caixa</Button></>}
 {error && <p role="alert" className="text-sm text-danger">{error}</p>}{step>1 && <Button variant="ghost" className="min-h-11" onClick={()=>setStep(step-1)} disabled={busy}>Voltar</Button>}
 </div><CsvImportDialog open={csv} onOpenChange={setCsv} onLimit={(_k,m)=>setError(m)} /></div></main>;
}
