import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertTriangle, ArrowRight, BellRing, CheckCircle2, Clock, Eye, FileSpreadsheet, MailCheck, ShieldCheck, TrendingDown, XCircle,
} from "lucide-react";
import { Logo, ThemeToggle } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PLANS } from "@/config/plans";
import { formatBRL } from "@/lib/format";

const TITLE = "Caixa Crítico — Saiba se seu caixa fecha nos próximos 30 dias";
const DESC = "Previsão de caixa de 15 e 30 dias e cobrança automática pelo WhatsApp para microempresas e profissionais liberais. 7 dias grátis, sem cartão.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "/" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav className="flex items-center gap-1">
            <a href="#precos" className="hidden px-3 text-sm text-muted-foreground hover:text-foreground sm:inline">Preços</a>
            <ThemeToggle />
            <Button asChild variant="ghost" className="h-11 rounded-xl"><Link to="/login">Entrar</Link></Button>
            <Button asChild className="hidden h-11 rounded-xl sm:inline-flex"><Link to="/cadastro">Começar grátis</Link></Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 md:grid-cols-2 md:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />Para microempresas e profissionais liberais
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              Saiba se o seu caixa fecha nos próximos 30 dias — e receba o que é seu sem esforço
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Abra o app e veja em 5 segundos se vai faltar dinheiro. Enquanto isso, os lembretes de cobrança saem sozinhos para seus clientes.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-xl px-6 text-base">
                <Link to="/cadastro">Começar 7 dias grátis <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <p className="self-center text-sm text-muted-foreground">Sem cartão de crédito · Cancele quando quiser</p>
            </div>
          </div>
          <DashboardMockup />
        </section>

        <section className="border-y bg-card py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-center text-3xl font-semibold tracking-tight">Do susto no fim do mês para a tranquilidade</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {[
                { p: "Você só descobre que o dinheiro não dá quando já é tarde.", s: "Semáforo mostra hoje o pior dia das próximas semanas.", icon: TrendingDown },
                { p: "Cobrar cliente é chato, constrangedor e fica pra depois.", s: "Régua automática envia lembretes educados por você.", icon: BellRing },
                { p: "Planilhas e ERPs complicados que ninguém atualiza.", s: "Cadastro em 10 segundos ou importação de CSV.", icon: FileSpreadsheet },
              ].map((c) => (
                <div key={c.p} className="rounded-2xl border bg-background p-6 shadow-[var(--shadow-soft)]">
                  <c.icon className="h-6 w-6 text-primary" />
                  <p className="mt-4 flex gap-2 text-sm text-muted-foreground"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />{c.p}</p>
                  <p className="mt-3 flex gap-2 font-medium"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />{c.s}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Como funciona</h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              ["Cadastre ou importe", "Adicione o que tem a receber e a pagar, ou suba uma planilha CSV."],
              ["Ative a régua", "Lembretes 2 dias antes, no dia, e 3 e 7 dias depois do vencimento. Já vem pronta."],
              ["Acompanhe o semáforo", "Verde, amarelo ou vermelho: você sabe na hora se o caixa fecha."],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-2xl border bg-card p-6">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-primary font-semibold text-primary-foreground">{i + 1}</span>
                <h3 className="mt-4 font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y bg-card py-16">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 md:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">Cobranças educadas, no seu nome</h2>
              <p className="mt-3 text-muted-foreground">Seu cliente recebe uma mensagem clara no WhatsApp, com o nome do seu negócio.</p>
              <ul className="mt-6 space-y-2 text-sm">
                {["Tom amigável que fica mais firme com o atraso", "Para de cobrar assim que você marca como pago", "Cliente pode pedir para parar a qualquer momento"].map((t) => (
                  <li key={t} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-success" />{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border bg-background p-6 shadow-[var(--shadow-soft)]" aria-label="Prévia de e-mail de cobrança">
              <div className="border-b pb-3 text-sm">
                <p><span className="text-muted-foreground">De:</span> Studio Ana Design</p>
                <p><span className="text-muted-foreground">Assunto:</span> Lembrete: Projeto de identidade visual vence em 12/10/2026</p>
              </div>
              <div className="space-y-3 pt-4 text-sm leading-relaxed">
                <p>Olá, Carlos!</p>
                <p>Passando para lembrar que <strong>Projeto de identidade visual</strong>, no valor de <strong className="num">R$ 2.400,00</strong>, vence em <strong className="num">12/10/2026</strong>.</p>
                <p>Obrigado! — Studio Ana Design</p>
                <p className="border-t pt-3 text-xs text-muted-foreground">Não quer mais receber lembretes? Descadastrar.</p>
              </div>
            </div>
          </div>
        </section>

        <Pricing />

        <section className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="text-center text-3xl font-semibold tracking-tight">Perguntas frequentes</h2>
          <Accordion type="single" collapsible className="mt-8">
            {[
              ["Preciso de cartão para testar?", "Não. São 7 dias grátis com todos os recursos do plano Pro, sem cartão. Depois, você escolhe se quer assinar."],
              ["Como funciona o cancelamento?", "Você cancela em dois cliques, a qualquer momento. O acesso continua até o fim do período já pago."],
              ["Meus dados estão seguros? E a LGPD?", "Seus dados ficam isolados por conta, com acesso protegido e criptografia em trânsito. Seguimos a LGPD: você pode exportar ou excluir tudo quando quiser."],
              ["A cobrança é pelo WhatsApp?", "Sim. Basta cadastrar o WhatsApp do cliente na conta a receber e os lembretes saem sozinhos."],
              ["Posso importar uma planilha?", "Sim. Envie um CSV com descrição, valor, vencimento, tipo, nome e WhatsApp. Mostramos uma prévia com os erros antes de importar."],
            ].map(([q, a]) => (
              <AccordionItem key={q} value={q}>
                <AccordionTrigger className="text-left">{q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="px-4 pb-16">
          <div className="mx-auto max-w-4xl rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground">
            <h2 className="text-3xl font-semibold tracking-tight">Pare de adivinhar o seu caixa</h2>
            <p className="mt-2 opacity-90">Configure em 2 minutos. Sem cartão.</p>
            <Button asChild size="lg" variant="secondary" className="mt-6 h-12 rounded-xl px-6 text-base">
              <Link to="/cadastro">Começar 7 dias grátis</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Caixa Crítico</p>
          <nav className="flex gap-5">
            <Link to="/termos" className="hover:text-foreground">Termos</Link>
            <Link to="/privacidade" className="hover:text-foreground">Privacidade</Link>
            <a href="mailto:contato@caixacritico.com.br" className="hover:text-foreground">Contato</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function DashboardMockup() {
  const pts = [60, 52, 48, 40, 30, 22, 18, 26, 34, 42, 50, 46];
  const path = pts.map((y, i) => `${i === 0 ? "M" : "L"}${i * 28},${y}`).join(" ");
  return (
    <div className="rounded-3xl border bg-card p-5 shadow-[var(--shadow-soft)]" aria-hidden="true">
      <div className="flex items-start gap-3 rounded-2xl bg-warning/10 p-4">
        <AlertTriangle className="mt-0.5 h-6 w-6 text-warning" />
        <div>
          <p className="font-semibold text-warning">Atenção</p>
          <p className="text-sm">Seu caixa fica abaixo da reserva em 18/10 (R$ 1.200,00)</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {[["Em 15 dias", "R$ 3.480"], ["Em 30 dias", "R$ 7.920"]].map(([l, v]) => (
          <div key={l} className="rounded-2xl border p-4">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="num mt-1 text-2xl font-bold">{v}</p>
          </div>
        ))}
      </div>
      <svg viewBox="0 0 310 80" className="mt-4 h-24 w-full">
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <div className="mt-2 flex items-center justify-between rounded-xl border p-3 text-sm">
        <span>Carlos M. · R$ 2.400</span>
        <span className="flex items-center gap-1 text-danger"><AlertTriangle className="h-4 w-4" />Alto</span>
      </div>
    </div>
  );
}

function Pricing() {
  const [yearly, setYearly] = useState(false);
  return (
    <section id="precos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
      <h2 className="text-center text-3xl font-semibold tracking-tight">Preços simples</h2>
      <div className="mt-6 flex justify-center">
        <div role="radiogroup" aria-label="Período de cobrança" className="inline-flex rounded-xl bg-muted p-1">
          {[["Mensal", false], ["Anual", true]].map(([l, v]) => (
            <button key={String(l)} role="radio" aria-checked={yearly === v} onClick={() => setYearly(v as boolean)}
              className={`h-10 rounded-lg px-4 text-sm font-medium ${yearly === v ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
              {l as string}{v ? <span className="ml-2 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">2 meses grátis</span> : null}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {PLANS.map((p) => (
          <div key={p.id} className={`relative rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)] ${p.popular ? "border-primary ring-2 ring-primary" : ""}`}>
            {p.popular && <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">Mais popular</span>}
            <h3 className="text-lg font-semibold">{p.name}</h3>
            <p className="mt-3"><span className="num text-4xl font-bold">{formatBRL(yearly ? p.priceYearCents : p.priceMonthCents, true)}</span><span className="text-muted-foreground">/{yearly ? "ano" : "mês"}</span></p>
            <ul className="mt-6 space-y-2 text-sm">
              {p.features.map((f) => <li key={f} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />{f}</li>)}
            </ul>
            <Button asChild variant={p.popular ? "default" : "outline"} className="mt-6 h-11 w-full rounded-xl"><Link to="/cadastro">Começar 7 dias grátis</Link></Button>
          </div>
        ))}
      </div>
      <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Eye className="h-4 w-4" />Todos os planos incluem projeção de 15 e 30 dias. <Clock className="h-4 w-4" />Sem fidelidade. <MailCheck className="h-4 w-4" />Suporte por e-mail.</p>
    </section>
  );
}
