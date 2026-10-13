import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BellRing,
  CalendarClock,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  CreditCard,
  FileSpreadsheet,
  Menu,
  ShieldCheck,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Critical Cash | Veja o aperto antes que ele chegue' },
      {
        name: 'description',
        content:
          'Organize contas a pagar e receber, acompanhe a projeção do seu fluxo de caixa e planeje os próximos passos do seu negócio com o Critical Cash.',
      },
      { property: 'og:title', content: 'Critical Cash — Clareza para cuidar do caixa' },
      {
        property: 'og:description',
        content: 'Organize suas contas e acompanhe o que pode acontecer com o caixa do seu negócio.',
      },
      { property: 'og:type', content: 'website' },
    ],
  }),
  component: IndexComponent,
});

const features = [
  {
    icon: TrendingUp,
    title: 'Projeção de fluxo de caixa',
    description: 'Visualize como entradas e saídas previstas podem afetar seu caixa nos próximos dias.',
  },
  {
    icon: Wallet,
    title: 'Contas a pagar e receber',
    description: 'Tenha vencimentos, valores e status organizados em um só lugar.',
  },
  {
    icon: BellRing,
    title: 'Lembretes e cobranças',
    description: 'Acompanhe pendências e use os recursos de lembrete disponíveis para não perder prazos.',
  },
  {
    icon: BarChart3,
    title: 'Visão financeira mais clara',
    description: 'Entenda o que já aconteceu e o que está previsto para decidir com mais contexto.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Importação de lançamentos',
    description: 'Quando disponível no seu fluxo de contas, importe dados por arquivo CSV e reduza o trabalho manual.',
  },
  {
    icon: CalendarClock,
    title: 'Rotina mais organizada',
    description: 'Consulte datas importantes e planeje pagamentos e recebimentos com antecedência.',
  },
];

const faqs = [
  {
    question: 'Para quem é o Critical Cash?',
    answer:
      'Para MEIs, autônomos e pequenos negócios que precisam organizar pagamentos e recebimentos e entender melhor o comportamento do caixa.',
  },
  {
    question: 'O saldo atual é a mesma coisa que a projeção?',
    answer:
      'Não. O saldo atual representa o valor do caixa no momento, conforme os lançamentos registrados. A projeção considera entradas e saídas futuras previstas; ela é uma estimativa e depende da qualidade e atualização dos dados.',
  },
  {
    question: 'Como começo a usar?',
    answer:
      'Crie sua conta, conclua as etapas iniciais e registre ou importe seus lançamentos. Depois, mantenha os valores e vencimentos atualizados para que a projeção seja útil.',
  },
  {
    question: 'O Critical Cash envia cobranças automaticamente?',
    answer:
      'O sistema inclui recursos de organização de lembretes e cobranças. A disponibilidade e o comportamento de cada envio dependem dos recursos e das configurações habilitados na sua conta. Confira os detalhes dentro do produto antes de depender de um envio automático.',
  },
  {
    question: 'Preciso informar dados bancários?',
    answer:
      'Comece registrando as informações financeiras necessárias para usar os recursos. Consulte a Política de Privacidade para entender como os dados são tratados. Não compartilhe senhas bancárias no sistema.',
  },
  {
    question: 'Existe período de teste?',
    answer:
      'O cadastro atual oferece 7 dias de teste sem cartão de crédito. Consulte a tela de assinatura para verificar os planos e condições vigentes.',
  },
];

function IndexComponent() {
  const [sessionActive, setSessionActive] = useState(false);
  const [userRolePath, setUserRolePath] = useState('/caixa');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const processAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && isMounted) {
        const userEmail = session.user.email?.toLowerCase().trim();
        const userRole = session.user.user_metadata?.role;
        const isAdmin =
          userEmail === 'gabrielmansano1979@gmail.com' || userRole === 'admin';

        if (isAdmin) {
          window.location.replace('/admin');
          return;
        }

        setSessionActive(true);
        setUserRolePath('/caixa');
      }
    };

    void processAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  const primaryPath = sessionActive ? userRolePath : '/cadastro';
  const navigateTo = (path: string) => {
    window.location.href = path;
  };
  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className="min-h-screen overflow-x-hidden bg-white font-sans text-slate-900 antialiased">
      <a
        href="#conteudo"
        className="sr-only z-[100] rounded-md bg-white p-3 text-slate-900 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#inicio" className="flex items-center gap-2.5" aria-label="Critical Cash, início">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-900/20">
              <TrendingUp className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-extrabold tracking-tight text-slate-950 sm:text-xl">
              Critical <span className="text-emerald-700">Cash</span>
            </span>
          </a>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Navegação principal">
            <a className="text-sm font-medium text-slate-600 transition hover:text-emerald-700" href="#como-funciona">Como funciona</a>
            <a className="text-sm font-medium text-slate-600 transition hover:text-emerald-700" href="#recursos">Recursos</a>
            <a className="text-sm font-medium text-slate-600 transition hover:text-emerald-700" href="#para-quem">Para quem é</a>
            <a className="text-sm font-medium text-slate-600 transition hover:text-emerald-700" href="#planos">Teste grátis</a>
            <a className="text-sm font-medium text-slate-600 transition hover:text-emerald-700" href="#duvidas">Dúvidas</a>
          </nav>

          <div className="hidden items-center gap-3 sm:flex">
            <Button variant="ghost" onClick={() => navigateTo('/login')} className="font-semibold text-slate-700 hover:text-emerald-700">
              Entrar
            </Button>
            <Button onClick={() => navigateTo(primaryPath)} className="rounded-xl bg-emerald-600 px-5 font-semibold text-white shadow-sm hover:bg-emerald-700">
              {sessionActive ? 'Abrir meu caixa' : 'Começar grátis'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 sm:hidden"
            aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <nav className="border-t border-slate-200 bg-white px-4 py-4 sm:hidden" aria-label="Navegação móvel">
            {[
              ['Como funciona', '#como-funciona'],
              ['Recursos', '#recursos'],
              ['Para quem é', '#para-quem'],
              ['Teste grátis', '#planos'],
              ['Dúvidas', '#duvidas'],
            ].map(([label, href]) => (
              <a key={href} href={href} onClick={closeMobileMenu} className="block rounded-lg px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                {label}
              </a>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => navigateTo('/login')}>Entrar</Button>
              <Button onClick={() => navigateTo(primaryPath)} className="bg-emerald-600 hover:bg-emerald-700">Começar grátis</Button>
            </div>
          </nav>
        )}
      </header>

      <main id="conteudo">
        <section id="inicio" className="relative isolate overflow-hidden bg-slate-950 text-white">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
            <div className="absolute -right-28 -top-40 h-[480px] w-[480px] rounded-full bg-emerald-500/20 blur-3xl" />
            <div className="absolute -bottom-48 left-0 h-[400px] w-[400px] rounded-full bg-teal-500/10 blur-3xl" />
            <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
          </div>
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.02fr_.98fr] lg:gap-10 lg:px-8 lg:py-24">
            <div className="relative z-10 max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3.5 py-2 text-xs font-semibold tracking-wide text-emerald-300 sm:text-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Mais clareza para o dia a dia financeiro
              </div>
              <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.65rem]">
                Veja o aperto no caixa <span className="text-emerald-400">antes que ele chegue.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">
                Organize contas a pagar e receber, acompanhe a projeção do seu fluxo de caixa e planeje os próximos passos do negócio com antecedência.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button onClick={() => navigateTo(primaryPath)} className="h-12 rounded-xl bg-emerald-500 px-6 text-base font-bold text-slate-950 shadow-lg shadow-emerald-950/30 hover:bg-emerald-400">
                  {sessionActive ? 'Abrir meu caixa' : 'Começar 7 dias grátis'}
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <a href="#recursos" className="inline-flex h-12 items-center justify-center rounded-xl border border-white/20 px-6 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/5">
                  Conhecer os recursos
                </a>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-400">
                <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> 7 dias para experimentar</span>
                <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400" /> Sem cartão de crédito</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[560px] lg:ml-auto" aria-label="Exemplo ilustrativo do painel financeiro">
              <div className="absolute -inset-5 rounded-[2rem] bg-emerald-400/10 blur-2xl" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-white p-4 text-slate-900 shadow-2xl shadow-black/30 sm:p-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Visão financeira</p>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">Resumo do caixa</h2>
                  </div>
                  <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">Exemplo ilustrativo</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 p-3.5 sm:p-4">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><Wallet className="h-4 w-4 text-emerald-600" /> Saldo atual</div>
                    <p className="mt-2 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">R$ 8.450,00</p>
                    <p className="mt-1 text-xs text-slate-500">Valor demonstrativo</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-3.5 sm:p-4">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><CalendarClock className="h-4 w-4 text-blue-600" /> Projeção futura</div>
                    <p className="mt-2 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">R$ 6.120,00</p>
                    <p className="mt-1 text-xs text-slate-500">Estimativa ilustrativa</p>
                  </div>
                </div>
                <div className="mt-4 rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-800">Movimento previsto</p>
                      <p className="mt-1 text-xs text-slate-500">Exemplo de entradas e saídas ao longo dos dias</p>
                    </div>
                    <span className="rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">DEMONSTRATIVO</span>
                  </div>
                  <div className="mt-5 flex h-28 items-end gap-2 sm:h-32" aria-hidden="true">
                    {[42, 57, 49, 72, 61, 82, 68, 92, 74, 84, 63, 76].map((height, index) => (
                      <div key={index} className="flex h-full flex-1 items-end">
                        <div className={index > 8 ? 'w-full rounded-t-md bg-amber-300' : 'w-full rounded-t-md bg-emerald-500'} style={{ height: `${height}%` }} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>Hoje</span><span>Próximos dias</span><span>Depois</span></div>
                </div>
                <div className="mt-3 flex items-center gap-3 rounded-xl bg-amber-50 p-3.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700"><BellRing className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-800">Atenção aos vencimentos</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-600">Acompanhe as próximas contas para planejar suas decisões.</p>
                  </div>
                </div>
                <p className="mt-3 text-center text-[10px] leading-4 text-slate-400">Tela conceitual com valores fictícios, apenas para demonstração.</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Benefícios" className="border-b border-slate-200 bg-white">
          <div className="mx-auto grid max-w-7xl gap-5 px-4 py-7 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
            {[
              { icon: Clock3, title: 'Antecipe cenários', text: 'Olhe além do saldo de hoje.' },
              { icon: Wallet, title: 'Organize as contas', text: 'Veja vencimentos e recebimentos.' },
              { icon: BellRing, title: 'Lembre-se dos prazos', text: 'Acompanhe pendências importantes.' },
              { icon: ShieldCheck, title: 'Decida com contexto', text: 'Use informações organizadas para planejar.' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon className="h-5 w-5" /></span>
                <div><h2 className="text-sm font-bold text-slate-900">{title}</h2><p className="mt-1 text-sm leading-5 text-slate-500">{text}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section id="recursos" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Tudo mais organizado</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">O caixa não precisa ser uma surpresa.</h2>
              <p className="mt-4 text-base leading-7 text-slate-600">Tenha uma visão mais prática dos compromissos financeiros e do que pode acontecer nos próximos dias.</p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, description }) => (
                <article key={title} className="group rounded-2xl border border-slate-200 bg-white p-6 transition duration-200 hover:-translate-y-1 hover:border-emerald-200 hover:shadow-lg hover:shadow-slate-900/5">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-50 text-emerald-700 transition group-hover:bg-emerald-600 group-hover:text-white"><Icon className="h-6 w-6" /></span>
                  <h3 className="mt-5 text-lg font-bold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="como-funciona" className="scroll-mt-24 bg-slate-50 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid items-start gap-12 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
              <div className="max-w-xl">
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Simples na rotina</p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Três passos para cuidar melhor do caixa.</h2>
                <p className="mt-5 leading-7 text-slate-600">Não é sobre adivinhar o futuro. É sobre organizar as informações que você tem e enxergar os compromissos que vêm pela frente.</p>
                <Button onClick={() => navigateTo(primaryPath)} className="mt-7 rounded-xl bg-emerald-600 px-5 font-semibold hover:bg-emerald-700">
                  {sessionActive ? 'Ir para meu caixa' : 'Começar agora'} <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-4">
                {[
                  { n: '01', title: 'Registre o que entra e sai', text: 'Organize contas a pagar, recebimentos, valores e datas de vencimento.' },
                  { n: '02', title: 'Separe o presente do futuro', text: 'Consulte o saldo atual e veja a projeção baseada nos lançamentos futuros registrados.' },
                  { n: '03', title: 'Planeje o próximo movimento', text: 'Use vencimentos e estimativas para priorizar pagamentos, acompanhar cobranças e decidir com mais antecedência.' },
                ].map((step) => (
                  <div key={step.n} className="flex gap-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
                    <span className="text-2xl font-extrabold tracking-tight text-emerald-700">{step.n}</span>
                    <div><h3 className="text-base font-bold text-slate-900">{step.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="para-quem" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto grid max-w-7xl items-center gap-10 rounded-3xl bg-emerald-950 px-6 py-9 text-white sm:px-10 sm:py-12 lg:grid-cols-2 lg:px-14">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-emerald-300">Feito para a realidade do pequeno negócio</p>
              <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Mais clareza para quem faz o negócio acontecer.</h2>
              <p className="mt-5 max-w-xl leading-7 text-emerald-50/80">Do trabalho autônomo à pequena empresa, organizar o caixa ajuda a enxergar compromissos e preparar os próximos passos sem depender de planilhas espalhadas.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                'MEIs e microempreendedores',
                'Profissionais autônomos',
                'Prestadores de serviço',
                'Pequenas empresas',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 p-4">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-400/15 text-emerald-300"><Check className="h-4 w-4" /></span>
                  <span className="text-sm font-semibold">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="planos" className="scroll-mt-24 border-y border-slate-200 bg-slate-50 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-4xl text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><CreditCard className="h-7 w-7" /></span>
            <p className="mt-5 text-sm font-bold uppercase tracking-[0.16em] text-emerald-700">Comece sem complicação</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Experimente o Critical Cash por 7 dias.</h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600">Conheça os recursos, organize os primeiros lançamentos e veja como a projeção pode ajudar na sua rotina. O cadastro atual não exige cartão de crédito para começar o teste.</p>
            <div className="mx-auto mt-8 flex max-w-md flex-col justify-center gap-3 sm:flex-row">
              <Button onClick={() => navigateTo(primaryPath)} className="h-12 rounded-xl bg-emerald-600 px-6 text-base font-bold hover:bg-emerald-700">
                {sessionActive ? 'Abrir meu caixa' : 'Criar minha conta grátis'} <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <Button variant="outline" onClick={() => navigateTo(sessionActive ? '/assinatura' : '/cadastro')} className="h-12 rounded-xl border-slate-300 px-6 text-base font-semibold">
                {sessionActive ? 'Ver assinatura' : 'Ver como começar'}
              </Button>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">Planos e condições vigentes são apresentados no fluxo de cadastro e assinatura. A projeção é uma estimativa, não uma garantia de resultado financeiro.</p>
          </div>
        </section>

        <section id="duvidas" className="scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-700"><CircleHelp className="h-6 w-6" /></span>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Dúvidas frequentes</h2>
              <p className="mt-3 text-slate-600">O essencial para começar com clareza.</p>
            </div>
            <div className="mt-9 divide-y divide-slate-200 border-y border-slate-200">
              {faqs.map((faq) => (
                <details key={faq.question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-bold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-4 [&::-webkit-details-marker]:hidden">
                    {faq.question}
                    <ChevronDown className="h-5 w-5 shrink-0 text-slate-500 transition group-open:rotate-180" />
                  </summary>
                  <p className="max-w-2xl pr-8 pt-3 text-sm leading-7 text-slate-600">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 rounded-3xl bg-slate-950 px-6 py-9 text-white sm:px-10 sm:py-12 md:flex-row md:items-center">
            <div className="max-w-2xl">
              <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">Seu próximo passo começa com clareza.</h2>
              <p className="mt-3 leading-7 text-slate-300">Organize as informações do caixa e tome decisões com mais contexto.</p>
            </div>
            <Button onClick={() => navigateTo(primaryPath)} className="h-12 shrink-0 rounded-xl bg-emerald-500 px-6 font-bold text-slate-950 hover:bg-emerald-400">
              {sessionActive ? 'Abrir Critical Cash' : 'Começar grátis'} <ArrowUpRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-9 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-7 sm:flex-row sm:items-center sm:justify-between">
          <a href="#inicio" className="flex items-center gap-2.5" aria-label="Critical Cash, voltar ao início">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 text-white"><TrendingUp className="h-4 w-4" /></span>
            <span className="font-extrabold tracking-tight text-slate-950">Critical <span className="text-emerald-700">Cash</span></span>
          </a>
          <nav className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-600" aria-label="Links legais">
            <a href="/termos" className="hover:text-emerald-700">Termos de uso</a>
            <a href="/privacidade" className="hover:text-emerald-700">Privacidade</a>
            <a href="/login" className="hover:text-emerald-700">Entrar</a>
          </nav>
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} Critical Cash. Todos os direitos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
