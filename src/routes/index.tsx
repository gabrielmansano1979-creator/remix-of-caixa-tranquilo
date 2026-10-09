import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, CheckCircle2, ShieldCheck, MessageCircle, Clock, TrendingUp } from "lucide-react";
import { Logo, ThemeToggle } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ReminderPreview } from "@/components/reminder-preview";
import { PLANS, FIRST_PIX_DISCOUNT } from "@/config/plans";
import { formatBRL } from "@/lib/format";
import heroA from "@/assets/hero-a.jpg";
import appPhone from "@/assets/app-phone.jpg";
import appLaptop from "@/assets/app-laptop.jpg";
import logoAsset from "@/assets/critical-cash-logo.png.asset.json";
const SITE_URL = "https://critical-cash.lovable.app";
const TITLE = "Critical Cash — 7 dias grátis para cuidar do seu caixa";
const DESC = "Previsão de caixa em 5 segundos e lembretes por E-mail e WhatsApp. Teste por 7 dias sem cartão.";
const LOGO_URL = logoAsset.url;
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: SITE_URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Organization",
        name: "Critical Cash",
        url: SITE_URL,
        logo: LOGO_URL,
      }),
    }],
  }),
  component: Landing,
});

const CTA = "Testar Grátis por 7 Dias";
function Landing() {
  return <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur"><div className="mx-auto flex min-h-20 max-w-6xl items-center justify-between gap-3 px-4"><Logo /><nav className="flex items-center gap-1"><a href="#precos" className="hidden px-3 text-sm text-muted-foreground md:block">Preços</a><ThemeToggle /><Button asChild variant="ghost" className="min-h-11"><Link to="/login">Entrar</Link></Button><Button asChild className="hidden min-h-11 lg:inline-flex"><Link to="/cadastro">{CTA}</Link></Button></nav></div></header>
    <main>
      <section className="plg-hero relative isolate overflow-hidden"><img src={heroA} alt="Empreendedor acompanhando suas finanças" className="absolute inset-0 -z-20 h-full w-full object-cover" /><div className="plg-hero-shade absolute inset-0 -z-10" /><div className="mx-auto max-w-6xl px-5 py-16 md:py-24"><p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4" />7 dias grátis · Sem cartão de crédito</p><h1 className="mt-5 text-5xl font-bold leading-tight md:text-6xl">Critical Cash</h1><p className="mt-6 max-w-2xl text-xl leading-relaxed">Acompanhe a previsão do seu caixa em 5 segundos e envie lembretes automáticos de cobrança por E-mail e WhatsApp sem constrangimento.</p><Button asChild size="lg" className="mt-8 min-h-12 max-w-full whitespace-normal"><Link to="/cadastro">{CTA}<ArrowRight className="ml-2 h-4 w-4 shrink-0" /></Link></Button><p className="mt-4 text-sm">Seu primeiro caixa em 90 segundos. Cancele quando quiser.</p></div></section>
      <section className="border-b bg-card"><div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 sm:grid-cols-3">{[[TrendingUp,"Antecipe o caixa","15 e 30 dias, sem complicação"],[MessageCircle,"Cobrança pelo WhatsApp","Revise e envie as mensagens manualmente"],[Clock,"Comece em 90 segundos","CSV ou seus primeiros lançamentos"]].map(([Icon,title,text]) => { const I = Icon as typeof Clock; return <div key={String(title)} className="flex items-start gap-3"><I className="h-6 w-6 shrink-0 text-primary" /><div><h2 className="font-semibold">{String(title)}</h2><p className="mt-1 text-sm text-muted-foreground">{String(text)}</p></div></div>; })}</div></section>
      <section className="mx-auto max-w-6xl px-5 py-16"><div className="max-w-2xl"><p className="text-sm font-semibold text-primary">CLAREZA PARA DECIDIR</p><h2 className="mt-3 text-3xl font-semibold">O seu próximo mês, à vista.</h2><p className="mt-4 text-muted-foreground">Saldo, contas e um semáforo que mostra quando seu dinheiro precisa de atenção.</p></div><div className="mt-8 grid items-center gap-8 md:grid-cols-5"><img src={appLaptop} alt="Demonstração do Critical Cash no computador" className="w-full rounded-lg md:col-span-3" loading="lazy" /><div className="md:col-span-2"><img src={appPhone} alt="Demonstração do caixa no celular" className="mx-auto max-h-80 w-full max-w-xs rounded-lg object-cover" loading="lazy" /></div></div></section>
      <section className="border-y bg-card py-16"><div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-2"><div><p className="text-sm font-semibold text-primary">COBRANÇAS PELO WHATSAPP</p><h2 className="mt-3 text-3xl font-semibold">Mensagens prontas para revisar e enviar.</h2><p className="mt-4 text-muted-foreground">Escolha a conta, confira nome, valor, vencimento e link de pagamento, edite a mensagem e abra a conversa no WhatsApp Web ou aplicativo.</p><ol className="mt-8 divide-y">{[["Antes do vencimento","Lembrete com valor e data"],["No vencimento","Aviso com os dados da conta"],["Após o vencimento","Cobrança amigável com link de pagamento"]].map(([day,message]) => <li key={day} className="flex flex-wrap items-center justify-between gap-3 py-4"><span className="font-medium">{day}</span><span className="flex items-center gap-2 text-sm text-primary"><MessageCircle className="h-4 w-4" />{message}</span></li>)}</ol></div><div className="self-center"><ReminderPreview /></div></div></section>
      <section className="mx-auto max-w-6xl px-5 py-16"><h2 className="text-3xl font-semibold">Da primeira conta à primeira decisão.</h2><ol className="mt-8 grid gap-8 md:grid-cols-3">{[["Seu negócio","Nome, e-mail e WhatsApp. Sem cartão."],["Seus números","Importe um CSV ou informe saldo, uma saída e uma entrada."],["Seu semáforo","Veja os próximos 30 dias e ative seus lembretes."]].map(([title,text],i) => <li key={title} className="border-t pt-5"><p className="num text-sm font-semibold text-primary">0{i+1}</p><h3 className="mt-3 text-xl font-semibold">{title}</h3><p className="mt-2 text-muted-foreground">{text}</p></li>)}</ol></section>
      <Pricing />
      <section className="mx-auto max-w-3xl px-5 py-16"><h2 className="text-3xl font-semibold">Antes de começar</h2><Accordion type="single" collapsible className="mt-6">{[["Preciso de cartão para testar?","Não. Seu teste dura 7 dias, com recursos Pro. Depois, escolha seu plano; sem assinatura, seus dados ficam em modo somente leitura."],["Como funciona o desconto?","A primeira assinatura paga via Pix tem 20% de desconto, no ciclo mensal ou anual. O anual também oferece 2 meses grátis no preço-base."],["Como envio uma cobrança?","Escolha a conta, revise a mensagem e abra a conversa no WhatsApp Web ou aplicativo. Você confirma o envio por lá."],["Posso trazer minha planilha?","Sim. Você confere as linhas e possíveis erros antes de importar seu CSV."],["Posso cancelar?","Sim. Sem fidelidade; seu acesso pago continua até o fim do período contratado."]].map(([q,a]) => <AccordionItem key={q} value={q}><AccordionTrigger className="text-left">{q}</AccordionTrigger><AccordionContent className="text-muted-foreground">{a}</AccordionContent></AccordionItem>)}</Accordion></section>
      <section className="bg-primary px-5 py-16 text-primary-foreground"><div className="mx-auto max-w-6xl"><h2 className="text-3xl font-semibold">Mais previsão. Menos sustos.</h2><p className="mt-3">7 dias para experimentar, sem cartão e sem compromisso.</p><Button asChild variant="secondary" size="lg" className="mt-6 min-h-12"><Link to="/cadastro">{CTA}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div></section>
    </main><footer className="border-t"><div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-5 px-5 py-8 text-sm text-muted-foreground"><p>© {new Date().getFullYear()} Critical Cash</p><nav className="flex flex-wrap gap-5"><Link to="/termos">Termos</Link><Link to="/privacidade">Privacidade</Link></nav></div></footer>
  </div>;
}
function Pricing() {
 const [yearly,setYearly] = useState(false);
 return <section id="precos" className="scroll-mt-24 border-y bg-card py-16"><div className="mx-auto max-w-6xl px-5"><p className="text-sm font-semibold text-success">7 dias grátis em qualquer plano</p><h2 className="mt-3 text-3xl font-semibold">Um plano para o seu próximo passo.</h2><div className="mt-6 flex flex-wrap items-center gap-4"><div role="radiogroup" aria-label="Período de cobrança" className="flex gap-1 rounded-lg bg-muted p-1">{([['Mensal',false],['Anual',true]] as const).map(([label,value]) => <Button key={label} variant={yearly === value ? 'secondary' : 'ghost'} role="radio" aria-checked={yearly === value} className="min-h-11" onClick={() => setYearly(value)}>{label}</Button>)}</div><p className="text-sm text-success">20% off na 1ª assinatura Pix · Anual: 2 meses grátis</p></div><div className="mt-10 grid gap-5 md:grid-cols-3">{PLANS.map(p => <div key={p.id} className={`relative flex flex-col rounded-lg border bg-background p-6 ${p.popular ? 'border-primary ring-1 ring-primary' : ''}`}>{p.popular && <p className="mb-3 text-xs font-semibold text-primary">MAIS POPULAR</p>}<h3 className="text-xl font-semibold">{p.name}</h3><p className="mt-4"><span className="num text-4xl font-bold">{formatBRL(yearly ? p.priceYearCents : p.priceMonthCents,true)}</span><span className="text-muted-foreground">/{yearly ? 'ano' : 'mês'}</span></p><p className="mt-2 text-sm text-success">1ª assinatura Pix: {formatBRL(Math.round((yearly ? p.priceYearCents : p.priceMonthCents)*(1-FIRST_PIX_DISCOUNT)))}</p><ul className="my-6 flex-1 space-y-3 text-sm">{p.features.map(f => <li key={f} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />{f}</li>)}</ul><Button asChild variant={p.popular ? 'default' : 'outline'} className="min-h-12 w-full whitespace-normal"><Link to="/cadastro">{CTA}</Link></Button></div>)}</div><p className="mt-5 text-sm text-muted-foreground">Teste com recursos Pro. Sem cartão, sem fidelidade.</p></div></section>;
}
