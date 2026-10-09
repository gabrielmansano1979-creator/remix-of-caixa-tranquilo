import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import {
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  MessageCircle,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Logo, ThemeToggle } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ReminderPreview } from "@/components/reminder-preview";
import { PLANS, FIRST_PIX_DISCOUNT } from "@/config/plans";
import { formatBRL } from "@/lib/format";
import appPhone from "@/assets/app-phone.jpg";
import appLaptop from "@/assets/app-laptop.jpg";
const SITE_URL = "https://critical-cash.lovable.app";
const TITLE = "Critical Cash — 7 dias grátis para cuidar do seu caixa";
const DESC =
  "Antecipe o caixa, acompanhe seus compromissos e prepare cobranças pelo WhatsApp. Teste por 7 dias sem cartão.";
export const Route = createFileRoute("/")({
  validateSearch: z.object({ ref: z.string().trim().max(80).optional() }),
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
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Critical Cash",
          url: SITE_URL,
        }),
      },
    ],
  }),
  component: Landing,
});

const CTA = "Testar grátis por 7 dias";
function Landing() {
  const { ref } = Route.useSearch();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-zinc-950/80 backdrop-blur-xl">
        <div className="mx-auto flex min-h-[4.5rem] max-w-7xl items-center justify-between gap-3 px-4 md:px-8">
          <Logo />
          <nav className="flex items-center gap-1">
            <a
              href="#recursos"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground md:block"
            >
              Recursos
            </a>
            <a
              href="#precos"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground md:block"
            >
              Planos
            </a>
            <ThemeToggle />
            <Button asChild variant="ghost" className="min-h-11">
              <Link to="/login">Entrar</Link>
            </Button>
            <Button
              asChild
              className="hidden min-h-11 rounded-xl shadow-[0_10px_30px_-8px_rgba(59,130,246,0.45)] transition-all duration-200 hover:-translate-y-0.5 lg:inline-flex"
            >
              <Link to="/cadastro" search={{ ref }}>{CTA}</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative isolate overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
          >
            <div className="absolute -top-64 left-[55%] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-blue-500/[0.12] blur-[130px]" />
            <div className="absolute right-[-10rem] top-56 h-[28rem] w-[28rem] rounded-full bg-emerald-500/[0.07] blur-[120px]" />
          </div>
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 md:px-8 md:py-28 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
            <div className="cash-reveal">
              <p className="flex w-fit items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-2 text-sm font-semibold text-emerald-300">
                <ShieldCheck className="h-4 w-4" /> 7 dias para conhecer, sem cartão
              </p>
              <h1 className="mt-7 max-w-2xl text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl md:text-6xl">
                Seu caixa, com a clareza de uma decisão executiva.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 md:text-lg">
                Antecipe entradas e saídas, acompanhe compromissos e prepare cobranças para enviar
                pelo WhatsApp, com os dados do negócio em um só lugar.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  asChild
                  size="lg"
                  className="min-h-12 rounded-xl px-6 shadow-[0_10px_30px_-8px_rgba(59,130,246,0.45)] transition-all duration-200 hover:-translate-y-0.5"
                >
                  <Link to="/cadastro" search={{ ref }}>
                    {CTA}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="min-h-12 rounded-xl border-white/15 bg-white/[0.04] px-6 text-slate-100 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.08]"
                >
                  <Link to="/login">Acessar minha conta</Link>
                </Button>
              </div>
              <p className="mt-4 text-sm text-slate-400">
                Teste com recursos Pro. Sem cartão e sem compromisso.
              </p>
            </div>
            <div className="relative cash-reveal lg:pl-3">
              <div className="absolute -inset-4 rounded-[2rem] bg-blue-500/[0.08] blur-2xl" />
              <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/75 p-2 shadow-[0_30px_100px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl">
                <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="ml-2 text-xs font-medium tracking-wide text-slate-400">
                    VISÃO FINANCEIRA
                  </span>
                </div>
                <img
                  src={appLaptop}
                  alt="Prévia do painel financeiro Critical Cash"
                  className="h-auto w-full rounded-b-2xl"
                />
              </div>
              <div className="dark-surface absolute -bottom-5 -left-2 hidden items-center gap-3 rounded-2xl p-4 shadow-2xl sm:flex md:left-[-2rem]">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-400/10 text-emerald-300">
                  <TrendingUp className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">Fluxo em perspectiva</p>
                  <p className="mt-0.5 text-xs text-slate-400">Entradas e saídas organizadas</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-label="Compromissos de experiência"
          className="border-y border-white/[0.07] bg-white/[0.02]"
        >
          <div className="mx-auto grid max-w-7xl gap-3 px-5 py-6 sm:grid-cols-3 md:px-8 md:py-8">
            <a
              href="/privacidade"
              className="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition-colors hover:bg-white/[0.05]"
            >
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <span>
                <strong className="block text-sm text-slate-100">Privacidade e LGPD</strong>
                <span className="mt-1 block text-xs leading-relaxed text-slate-400">
                  Consulte como os dados são tratados.
                </span>
              </span>
            </a>
            <div className="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-300" />
              <span>
                <strong className="block text-sm text-slate-100">Conexão protegida</strong>
                <span className="mt-1 block text-xs leading-relaxed text-slate-400">
                  Acesso à conta por conexão segura HTTPS.
                </span>
              </span>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
              <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
              <span>
                <strong className="block text-sm text-slate-100">Envio sob seu controle</strong>
                <span className="mt-1 block text-xs leading-relaxed text-slate-400">
                  Você revisa a mensagem e confirma o envio no WhatsApp.
                </span>
              </span>
            </div>
          </div>
        </section>

        <section
          id="recursos"
          className="mx-auto max-w-7xl scroll-mt-24 px-5 py-20 md:px-8 md:py-28"
        >
          <div className="max-w-2xl">
            <p className="text-xs font-bold tracking-[0.2em] text-blue-300">
              VISÃO FINANCEIRA EXECUTIVA
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight text-white md:text-4xl">
              Menos ruído. Mais clareza para agir.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-300">
              Um espaço de trabalho para entender o caixa, organizar compromissos e dar sequência às
              cobranças do seu negócio.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-6">
            <article className="group overflow-hidden rounded-3xl border border-white/[0.09] bg-zinc-900/60 p-6 shadow-[0_18px_50px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-2xl md:col-span-4 md:p-8">
              <div className="grid h-11 w-11 place-items-center rounded-xl border border-emerald-300/15 bg-emerald-300/[0.08] text-emerald-300">
                <TrendingUp className="h-5 w-5" />
              </div>
              <h3 className="mt-6 text-xl font-semibold text-white">O próximo mês, à vista</h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
                Acompanhe saldo, entradas, saídas e projeções para identificar quando o caixa
                precisa de atenção.
              </p>
              <img
                src={appLaptop}
                alt="Painel com visão geral do fluxo de caixa"
                className="mt-7 w-full rounded-2xl border border-white/[0.08] object-cover object-top"
                loading="lazy"
              />
            </article>
            <article className="group rounded-3xl border border-white/[0.09] bg-zinc-900/60 p-6 shadow-[0_18px_50px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-2xl md:col-span-2 md:p-8">
              <div className="grid h-11 w-11 place-items-center rounded-xl border border-blue-300/15 bg-blue-300/[0.08] text-blue-300">
                <Clock className="h-5 w-5" />
              </div>
              <h3 className="mt-6 text-xl font-semibold text-white">Contas organizadas</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Visualize vencimentos, valores e status em uma rotina financeira mais fácil de
                acompanhar.
              </p>
              <div className="mt-8 space-y-3 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                {["Entradas previstas", "Contas a vencer", "Pendências em aberto"].map(
                  (item, index) => (
                    <div key={item} className="flex items-center gap-3 text-sm text-slate-300">
                      <span
                        className={`h-2 w-2 rounded-full ${index === 0 ? "bg-emerald-400" : index === 1 ? "bg-blue-300" : "bg-amber-300"}`}
                      />
                      {item}
                    </div>
                  ),
                )}
              </div>
            </article>
            <article className="group flex flex-col justify-between rounded-3xl border border-white/[0.09] bg-gradient-to-br from-blue-500/[0.12] to-zinc-900/70 p-6 shadow-[0_18px_50px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-2xl md:col-span-3 md:p-8">
              <div>
                <div className="grid h-11 w-11 place-items-center rounded-xl border border-blue-300/15 bg-blue-300/[0.08] text-blue-300">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-white">Cobrança pelo WhatsApp</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
                  Confira os dados da conta, personalize a mensagem e abra a conversa com o cliente
                  para confirmar o envio.
                </p>
              </div>
              <div className="mt-7 flex items-center gap-3 rounded-2xl border border-white/10 bg-zinc-950/55 p-4 text-sm text-slate-300">
                <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-300" />
                <span>Mensagem revisada por você antes de enviar</span>
              </div>
            </article>
            <article className="group flex flex-col justify-between rounded-3xl border border-white/[0.09] bg-zinc-900/60 p-6 shadow-[0_18px_50px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:shadow-2xl md:col-span-3 md:p-8">
              <div>
                <div className="grid h-11 w-11 place-items-center rounded-xl border border-amber-300/15 bg-amber-300/[0.08] text-amber-200">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-white">Comece com os seus dados</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
                  Importe um arquivo CSV ou cadastre contas e acompanhe as informações em uma visão
                  centralizada.
                </p>
              </div>
              <img
                src={appPhone}
                alt="Prévia do Critical Cash em um celular"
                className="mt-7 ml-auto h-36 w-36 rounded-2xl border border-white/10 object-cover object-top"
                loading="lazy"
              />
            </article>
          </div>
        </section>

        <section className="border-y border-white/[0.07] bg-white/[0.02] py-20 md:py-28">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold tracking-wide text-blue-300">
                COBRANÇAS PELO WHATSAPP
              </p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-white">
                Mensagens prontas para revisar e enviar.
              </h2>
              <p className="mt-4 leading-relaxed text-slate-300">
                Escolha a conta, confira nome, valor, vencimento e link de pagamento, edite a
                mensagem e abra a conversa no WhatsApp Web ou aplicativo.
              </p>
              <ol className="mt-8 divide-y divide-white/[0.08]">
                {[
                  ["Antes do vencimento", "Lembrete com valor e data"],
                  ["No vencimento", "Aviso com os dados da conta"],
                  ["Após o vencimento", "Cobrança amigável com link de pagamento"],
                ].map(([day, message]) => (
                  <li key={day} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <span className="font-medium text-slate-100">{day}</span>
                    <span className="flex items-center gap-2 text-sm text-emerald-300">
                      <MessageCircle className="h-4 w-4" />
                      {message}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-3xl border border-white/[0.09] bg-zinc-900/60 p-5 shadow-[0_24px_80px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl md:p-7">
              <ReminderPreview />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Da primeira conta à primeira decisão.
          </h2>
          <ol className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              ["Seu negócio", "Informe os dados e comece sem cartão."],
              ["Seus números", "Importe um CSV ou informe saldo, uma saída e uma entrada."],
              ["Seu semáforo", "Veja os próximos 30 dias e prepare suas mensagens."],
            ].map(([title, text], index) => (
              <li
                key={title}
                className="rounded-2xl border border-white/[0.09] bg-zinc-900/60 p-6 shadow-[0_18px_50px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 md:p-8"
              >
                <p className="num text-xs font-bold tracking-[0.18em] text-blue-300">
                  ETAPA 0{index + 1}
                </p>
                <h3 className="mt-5 text-xl font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <Pricing />

        <section className="mx-auto max-w-3xl px-5 py-20 md:py-24">
          <p className="text-xs font-bold tracking-[0.2em] text-blue-300">PERGUNTAS FREQUENTES</p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white">Antes de começar</h2>
          <Accordion type="single" collapsible className="mt-6">
            {[
              [
                "Preciso de cartão para testar?",
                "Não. Seu teste dura 7 dias, com recursos Pro. Depois, escolha seu plano; sem assinatura, seus dados ficam em modo somente leitura.",
              ],
              [
                "Como funciona o desconto?",
                "A primeira assinatura paga via Pix tem 20% de desconto, no ciclo mensal ou anual. O anual também oferece 2 meses grátis no preço-base.",
              ],
              [
                "Como envio uma cobrança?",
                "Escolha a conta, revise a mensagem e abra a conversa no WhatsApp Web ou aplicativo. Você confirma o envio por lá.",
              ],
              [
                "Posso trazer minha planilha?",
                "Sim. Você confere as linhas e possíveis erros antes de importar seu CSV.",
              ],
              [
                "Posso cancelar?",
                "Sim. Sem fidelidade; seu acesso pago continua até o fim do período contratado.",
              ],
            ].map(([question, answer]) => (
              <AccordionItem key={question} value={question} className="border-white/[0.09]">
                <AccordionTrigger className="text-left text-slate-100 hover:no-underline">
                  {question}
                </AccordionTrigger>
                <AccordionContent className="leading-relaxed text-slate-400">
                  {answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>

        <section className="relative isolate overflow-hidden border-y border-blue-300/15 bg-gradient-to-r from-blue-950/90 via-slate-900 to-zinc-950 px-5 py-20 md:py-24">
          <div className="absolute -right-20 -top-32 -z-10 h-96 w-96 rounded-full bg-blue-500/10 blur-[100px]" />
          <div className="mx-auto max-w-6xl">
            <p className="text-sm font-semibold tracking-wide text-blue-200">
              CLAREZA PARA O PRÓXIMO PASSO
            </p>
            <h2 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight text-white md:text-4xl">
              Mais previsibilidade para cuidar do seu caixa.
            </h2>
            <p className="mt-4 text-slate-300">
              7 dias para experimentar, sem cartão e sem compromisso.
            </p>
            <Button
              asChild
              size="lg"
              className="mt-7 min-h-12 rounded-xl shadow-[0_10px_30px_-8px_rgba(59,130,246,0.45)] transition-all duration-200 hover:-translate-y-0.5"
            >
              <Link to="/cadastro" search={{ ref }}>
                {CTA}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
      <footer className="border-t border-white/[0.08] bg-zinc-950/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-8 md:px-8">
          <div>
            <Logo />
            <p className="mt-3 text-xs text-slate-500">
              © {new Date().getFullYear()} Critical Cash
            </p>
          </div>
          <nav
            aria-label="Links institucionais"
            className="flex flex-wrap gap-5 text-sm text-slate-400"
          >
            <Link to="/termos" className="transition-colors hover:text-white">
              Termos
            </Link>
            <Link to="/privacidade" className="transition-colors hover:text-white">
              Privacidade
            </Link>
            <Link to="/login" className="transition-colors hover:text-white">
              Entrar
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
function Pricing() {
  const [yearly, setYearly] = useState(false);
  return (
    <section
      id="precos"
      className="scroll-mt-24 border-y border-white/[0.07] bg-white/[0.02] py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <p className="text-sm font-semibold text-emerald-300">7 dias grátis em qualquer plano</p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-white md:text-4xl">
          Um plano para o seu próximo passo.
        </h2>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <div
            role="radiogroup"
            aria-label="Período de cobrança"
            className="flex gap-1 rounded-xl border border-white/[0.08] bg-zinc-900/70 p-1"
          >
            {(
              [
                ["Mensal", false],
                ["Anual", true],
              ] as const
            ).map(([label, value]) => (
              <Button
                key={label}
                variant={yearly === value ? "secondary" : "ghost"}
                role="radio"
                aria-checked={yearly === value}
                className={`min-h-10 rounded-lg ${yearly === value ? "bg-blue-500/15 text-blue-200 hover:bg-blue-500/20" : "text-slate-400 hover:text-white"}`}
                onClick={() => setYearly(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="text-sm text-emerald-300">
            20% de desconto na primeira assinatura Pix · Anual: 2 meses grátis
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PLANS.map((plan) => (
            <article
              key={plan.id}
              className={`relative flex flex-col rounded-3xl border bg-zinc-900/60 p-6 shadow-[0_18px_50px_-35px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-white/20 md:p-7 ${plan.popular ? "border-blue-300/40 ring-1 ring-blue-300/20" : "border-white/[0.09]"}`}
            >
              {plan.popular && (
                <p className="mb-3 w-fit rounded-full border border-amber-300/20 bg-amber-300/[0.08] px-3 py-1 text-xs font-semibold tracking-wide text-amber-200">
                  MAIS POPULAR
                </p>
              )}
              <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
              <p className="mt-4">
                <span className="num font-mono text-4xl font-bold tracking-tight text-white">
                  {formatBRL(yearly ? plan.priceYearCents : plan.priceMonthCents, true)}
                </span>
                <span className="text-slate-400">/{yearly ? "ano" : "mês"}</span>
              </p>
              <p className="mt-2 text-sm text-emerald-300">
                Primeira assinatura Pix:{" "}
                {formatBRL(
                  Math.round(
                    (yearly ? plan.priceYearCents : plan.priceMonthCents) *
                      (1 - FIRST_PIX_DISCOUNT),
                  ),
                )}
              </p>
              <ul className="my-7 flex-1 space-y-3 text-sm text-slate-300">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                variant={plan.popular ? "default" : "outline"}
                className={`min-h-12 w-full whitespace-normal rounded-xl ${plan.popular ? "shadow-[0_10px_30px_-8px_rgba(59,130,246,0.4)]" : "border-white/15 bg-white/[0.03] text-slate-100 hover:bg-white/[0.08]"}`}
              >
                <Link to="/cadastro" search={{ ref }}>{CTA}</Link>
              </Button>
            </article>
          ))}
        </div>
        <p className="mt-5 text-sm text-slate-400">
          Teste com recursos Pro. Sem cartão, sem fidelidade.
        </p>
      </div>
    </section>
  );
}
