import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  LockKeyhole,
  Menu,
  ShieldCheck,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

function IndexComponent() {
  const [sessionActive, setSessionActive] = useState(false);
  const [userRolePath, setUserRolePath] = useState('/login');
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const processAuthAndLanding = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && isMounted) {
        const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
          _user_id: session.user.id,
          _role: 'admin',
        });

        if (!isMounted) return;

        if (roleError) {
          console.error('[HOME] Não foi possível verificar a função administrativa:', roleError);
        }

        if (!roleError && isAdmin === true) {
          window.location.replace('/admin');
          return;
        }

        setSessionActive(true);
        setUserRolePath('/caixa');
      }

      if (isMounted) setLoadingAuth(false);
    };

    void processAuthAndLanding();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleNavigate = (path: string) => {
    window.location.href = path;
  };

  const primaryPath = sessionActive ? userRolePath : '/login';

  return (
    <div className="min-h-screen overflow-hidden bg-[#080b0a] font-sans text-zinc-100 antialiased">
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#080b0a]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <a href="/" aria-label="Critical Cash — início" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">
              <TrendingUp className="h-5 w-5" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-white sm:text-xl">Critical <span className="text-emerald-300">Cash</span></span>
          </a>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Navegação principal">
            <a href="#recursos" className="text-sm text-zinc-400 transition hover:text-white">Recursos</a>
            <a href="#planos" className="text-sm text-zinc-400 transition hover:text-white">Planos</a>
            <a href="#contadores" className="text-sm text-zinc-400 transition hover:text-white">Contadores afiliados</a>
            <a href="#como-funciona" className="text-sm text-zinc-400 transition hover:text-white">Como funciona</a>
            <a href="#duvidas" className="text-sm text-zinc-400 transition hover:text-white">Dúvidas</a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Button variant="ghost" onClick={() => handleNavigate('/login')} className="text-zinc-300 hover:bg-white/5 hover:text-white">
              Entrar
            </Button>
            <Button onClick={() => handleNavigate(primaryPath)} className="rounded-xl bg-emerald-400 px-5 font-semibold text-zinc-950 shadow-lg shadow-emerald-950/30 hover:bg-emerald-300">
              {loadingAuth ? 'Acessar plataforma' : sessionActive ? 'Abrir meu painel' : 'Começar agora'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-zinc-200 md:hidden" aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileMenuOpen && (
          <nav className="border-t border-white/10 px-5 py-4 md:hidden" aria-label="Navegação móvel">
            <div className="mx-auto flex max-w-7xl flex-col gap-4">
              <a href="#recursos" onClick={() => setMobileMenuOpen(false)} className="py-1 text-sm text-zinc-300">Recursos</a>
              <a href="#planos" onClick={() => setMobileMenuOpen(false)} className="py-1 text-sm text-zinc-300">Planos e preços</a>
              <a href="#contadores" onClick={() => setMobileMenuOpen(false)} className="py-1 text-sm text-zinc-300">Contadores afiliados</a>
              <a href="#como-funciona" onClick={() => setMobileMenuOpen(false)} className="py-1 text-sm text-zinc-300">Como funciona</a>
              <a href="#duvidas" onClick={() => setMobileMenuOpen(false)} className="py-1 text-sm text-zinc-300">Dúvidas</a>
              <Button onClick={() => handleNavigate(primaryPath)} className="w-full rounded-xl bg-emerald-400 font-semibold text-zinc-950 hover:bg-emerald-300">Acessar plataforma <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </div>
          </nav>
        )}
      </header>

      <main>
        <section className="relative isolate px-5 pb-20 pt-20 sm:px-8 sm:pb-28 sm:pt-28 lg:pt-32">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
            <div className="absolute left-1/2 top-0 h-[520px] w-[850px] -translate-x-1/2 rounded-full bg-emerald-500/[0.09] blur-[130px]" />
            <div className="absolute right-[-10%] top-40 h-64 w-64 rounded-full bg-teal-500/[0.06] blur-[100px]" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>

          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16">
            <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-3.5 py-2 text-xs font-medium tracking-wide text-emerald-200 sm:text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Gestão de caixa com visão executiva
              </div>
              <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-[-0.04em] text-white sm:text-5xl lg:text-[3.65rem]">
                Mais clareza para decidir. <span className="text-emerald-300">Mais controle sobre o caixa.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-base leading-8 text-zinc-400 sm:text-lg lg:mx-0">
                Organize a rotina financeira, acompanhe os movimentos e transforme informações do caixa em uma visão mais clara para a gestão do seu negócio.
              </p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                <Button onClick={() => handleNavigate(primaryPath)} className="h-12 rounded-xl bg-emerald-400 px-6 text-base font-semibold text-zinc-950 shadow-xl shadow-emerald-950/30 hover:bg-emerald-300">
                  {sessionActive ? 'Acessar meu painel' : 'Acessar / criar minha conta'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={() => document.getElementById('recursos')?.scrollIntoView({ behavior: 'smooth' })} className="h-12 rounded-xl border-white/15 bg-white/[0.03] px-6 text-base text-zinc-200 hover:bg-white/[0.07] hover:text-white">
                  Conhecer recursos
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-xs text-zinc-500 sm:text-sm lg:justify-start">
                <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Acesso autenticado</span>
                <span className="hidden h-1 w-1 rounded-full bg-zinc-700 sm:block" />
                <span className="inline-flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-emerald-300" /> Acesso por conta</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -inset-5 rounded-[2rem] bg-emerald-400/[0.07] blur-2xl" />
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#101512] shadow-2xl shadow-black/50">
                <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4 sm:px-6">
                  <div>
                    <p className="text-xs font-medium text-zinc-500">VISÃO GERAL</p>
                    <p className="mt-1 text-sm font-semibold text-white">Painel de gestão</p>
                  </div>
                  <span className="rounded-lg border border-emerald-300/15 bg-emerald-300/[0.08] px-3 py-1.5 text-xs text-emerald-200">Critical Cash</span>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-6">
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
                    <div className="flex items-center justify-between text-zinc-500"><span className="text-xs">Rotina de caixa</span><Wallet className="h-4 w-4 text-emerald-300" /></div>
                    <p className="mt-5 text-lg font-semibold text-white sm:text-xl">Organizada</p>
                    <p className="mt-1 text-xs text-zinc-500">Movimentos em um só fluxo</p>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
                    <div className="flex items-center justify-between text-zinc-500"><span className="text-xs">Acompanhamento</span><BarChart3 className="h-4 w-4 text-emerald-300" /></div>
                    <p className="mt-5 text-lg font-semibold text-white sm:text-xl">Visão clara</p>
                    <p className="mt-1 text-xs text-zinc-500">Informações para analisar</p>
                  </div>
                  <div className="col-span-2 rounded-xl border border-emerald-300/15 bg-gradient-to-br from-emerald-300/[0.09] to-transparent p-5 sm:p-6">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-300/10 text-emerald-200"><ClipboardCheck className="h-5 w-5" /></span>
                      <div><p className="text-sm font-semibold text-white">Controle e conferência</p><p className="mt-1 text-xs text-zinc-400">Apoio à rotina de fechamento e revisão</p></div>
                    </div>
                    <div className="mt-5 space-y-3">
                      <div className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" /><div className="h-2 flex-1 rounded-full bg-white/10"><div className="h-2 w-[84%] rounded-full bg-emerald-300/70" /></div><span className="text-[10px] text-zinc-500">Organização</span></div>
                      <div className="flex items-center gap-3"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" /><div className="h-2 flex-1 rounded-full bg-white/10"><div className="h-2 w-[68%] rounded-full bg-emerald-300/50" /></div><span className="text-[10px] text-zinc-500">Conferência</span></div>
                      <p className="pt-1 text-[10px] leading-5 text-zinc-600">Ilustração conceitual da proposta do produto; não representa dados financeiros reais.</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 border-t border-white/[0.08] px-5 py-3 text-xs text-zinc-500 sm:px-6">
                  <LockKeyhole className="h-3.5 w-3.5 text-emerald-300" /> Entre com sua conta para acessar seu ambiente.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="recursos" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Recursos para a rotina</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">O essencial para acompanhar seu caixa com mais confiança</h2>
              <p className="mt-4 leading-7 text-zinc-400">Uma experiência pensada para apoiar a organização, a conferência e a leitura das informações financeiras do negócio.</p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { icon: Wallet, title: 'Rotina de caixa', description: 'Centralize a atenção nos movimentos e nas tarefas do dia a dia do caixa.' },
                { icon: ClipboardCheck, title: 'Conferência e auditoria', description: 'Apoie os processos de verificação e fechamento com uma rotina mais organizada.' },
                { icon: BarChart3, title: 'Visão gerencial', description: 'Consulte informações organizadas para apoiar análises e decisões do negócio.' },
                { icon: ShieldCheck, title: 'Acesso por conta', description: 'Acesse o ambiente autenticado e mantenha as áreas de gestão separadas do site público.' },
                { icon: TrendingUp, title: 'Acompanhamento da operação', description: 'Tenha um ponto central para acompanhar a operação financeira do estabelecimento.' },
                { icon: LockKeyhole, title: 'Atenção ao controle de acesso', description: 'O sistema utiliza autenticação e verificação de permissões para direcionar o acesso aos ambientes.' },
              ].map(({ icon: Icon, title, description }) => (
                <article key={title} className="group rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 transition duration-200 hover:-translate-y-1 hover:border-emerald-300/20 hover:bg-white/[0.04]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-200 transition group-hover:bg-emerald-300/10"><Icon className="h-5 w-5" /></span>
                  <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="planos" className="scroll-mt-24 border-y border-white/[0.07] bg-white/[0.02] px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Planos e preços</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Escolha o nível de controle ideal para o seu negócio</h2>
              <p className="mt-4 leading-7 text-zinc-400">Todos os planos incluem organização de contas a receber, cobranças manuais pelo WhatsApp, importação de dados por CSV e projeções financeiras. Os limites e as opções de personalização variam por plano.</p>
            </div>
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {[
                { name: 'Starter', price: 'R$ 29', annual: 'R$ 290', limit: 'Até 100 contas pendentes', rows: 'CSV com até 100 linhas', risks: 'Top 3 maiores riscos', detail: 'Régua padrão com 4 etapas e projeções de 15 e 30 dias.', popular: false },
                { name: 'Pro', price: 'R$ 59', annual: 'R$ 590', limit: 'Até 500 contas pendentes', rows: 'CSV com até 500 linhas', risks: 'Top 5 maiores riscos', detail: 'Personalize os dias e ative ou desative etapas da régua de cobrança.', popular: true },
                { name: 'Business', price: 'R$ 119', annual: 'R$ 1.190', limit: 'Até 2.000 contas pendentes', rows: 'CSV com até 2.000 linhas', risks: 'Top 10 maiores riscos', detail: 'Personalize os dias, as mensagens e as etapas da régua de cobrança.', popular: false },
              ].map((plan) => (
                <article key={plan.name} className={'relative flex flex-col rounded-2xl border bg-[#0c100e] p-6 shadow-xl shadow-black/10 ' + (plan.popular ? 'border-emerald-300/40 ring-1 ring-emerald-300/20' : 'border-white/[0.09]')}>
                  {plan.popular && <span className="absolute -top-3 left-6 rounded-full bg-emerald-300 px-3 py-1 text-xs font-semibold text-zinc-950">Mais escolhido</span>}
                  <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
                  <p className="mt-4"><span className="text-4xl font-semibold tracking-tight text-white">{plan.price}</span><span className="text-sm text-zinc-400">/mês</span></p>
                  <p className="mt-1 text-sm text-zinc-400">ou <span className="font-semibold text-emerald-200">{plan.annual}/ano</span> <span className="text-zinc-500">(2 meses grátis)</span></p>
                  <div className="my-6 h-px bg-white/[0.08]" />
                  <ul className="space-y-3 text-sm leading-6 text-zinc-300">
                    {[plan.limit, 'Cobranças manuais pelo WhatsApp', plan.rows, plan.detail, 'Projeções de 15 e 30 dias', plan.risks, plan.name === 'Starter' ? 'Suporte padrão' : 'Suporte prioritário'].map((feature) => (
                      <li key={feature} className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-300" /><span>{feature}</span></li>
                    ))}
                  </ul>
                  <Button onClick={() => handleNavigate(primaryPath)} className={'mt-7 h-11 w-full rounded-xl font-semibold ' + (plan.popular ? 'bg-emerald-400 text-zinc-950 hover:bg-emerald-300' : 'bg-white/[0.08] text-white hover:bg-white/[0.13]')}>
                    Começar com {plan.name}<ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </article>
              ))}
            </div>
            <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-6 text-zinc-500">Valores em reais. No plano anual, o total equivale a 10 mensalidades. O primeiro pagamento via Pix pode ter 10% de desconto; cupons de contador afiliado oferecem 20% de desconto e não são cumulativos com outras ofertas. As condições exibidas no checkout prevalecem.</p>
          </div>
        </section>

        <section id="contadores" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Programa para contadores</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Indique o Critical Cash aos seus clientes e receba comissões</h2>
              <p className="mt-5 leading-7 text-zinc-400">Contadores e escritórios contábeis podem se candidatar ao programa de afiliados, compartilhar seu cupom e ajudar clientes a organizar o contas a receber, as cobranças e a visão de caixa.</p>
              <Button onClick={() => handleNavigate('/login')} className="mt-7 h-12 rounded-xl bg-emerald-400 px-6 font-semibold text-zinc-950 hover:bg-emerald-300">
                Quero ser contador afiliado<ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <p className="mt-3 text-xs leading-5 text-zinc-500">Entre ou crie sua conta e, depois, acesse a área Contador para enviar sua solicitação. A participação depende de aprovação e validação cadastral.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <article className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-6">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Benefício para o cliente</span>
                <p className="mt-3 text-4xl font-semibold text-white">20% <span className="text-base font-medium text-zinc-400">OFF</span></p>
                <p className="mt-3 text-sm leading-6 text-zinc-400">O cupom do contador oferece 20% de desconto conforme as regras do programa, sem acumular com outras ofertas.</p>
              </article>
              <article className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-6">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200">Comissão por faixa</span>
                <p className="mt-3 text-4xl font-semibold text-white">20–30%</p>
                <p className="mt-3 text-sm leading-6 text-zinc-400">A comissão é calculada sobre o valor efetivamente recebido, após descontos, conforme os pagamentos confirmados dos clientes indicados.</p>
              </article>
              <article className="rounded-2xl border border-white/[0.09] bg-white/[0.025] p-6 sm:col-span-2">
                <h3 className="font-semibold text-white">Como evolui a comissão</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4"><p className="text-2xl font-semibold text-emerald-200">20%</p><p className="mt-1 text-sm text-zinc-400">De 1 a 5 clientes com pagamento confirmado</p></div>
                  <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4"><p className="text-2xl font-semibold text-emerald-200">25%</p><p className="mt-1 text-sm text-zinc-400">De 6 a 15 clientes com pagamento confirmado</p></div>
                  <div className="rounded-xl border border-white/[0.08] bg-black/20 p-4"><p className="text-2xl font-semibold text-emerald-200">30%</p><p className="mt-1 text-sm text-zinc-400">A partir de 16 clientes com pagamento confirmado</p></div>
                </div>
                <p className="mt-4 text-xs leading-5 text-zinc-500">As faixas são recalculadas automaticamente conforme o total de clientes únicos com pagamento confirmado. Saques e comissões ficam sujeitos às regras do programa, à aprovação do cadastro e à validação dos dados de recebimento.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="como-funciona" className="scroll-mt-24 border-y border-white/[0.07] bg-white/[0.02] px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Comece por aqui</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Uma entrada simples para sua rotina de gestão</h2>
              <p className="mt-5 leading-7 text-zinc-400">Acesse sua conta para entrar no ambiente do Critical Cash. Se ainda não tiver cadastro, use a opção de criar conta na tela de acesso.</p>
              <Button onClick={() => handleNavigate(primaryPath)} className="mt-7 h-12 rounded-xl bg-emerald-400 px-6 font-semibold text-zinc-950 hover:bg-emerald-300">
                {sessionActive ? 'Ir para meu painel' : 'Entrar ou criar conta'} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4">
              {[
                { n: '01', title: 'Acesse a plataforma', description: 'Entre com sua conta existente ou abra a tela de acesso para iniciar seu cadastro.' },
                { n: '02', title: 'Vá para seu ambiente', description: 'Após a autenticação, o sistema direciona você conforme as permissões da sua conta.' },
                { n: '03', title: 'Use os recursos disponíveis', description: 'Explore as funcionalidades liberadas no seu ambiente e siga os processos da sua operação.' },
              ].map((step) => (
                <div key={step.n} className="flex gap-5 rounded-2xl border border-white/[0.08] bg-[#0c100e] p-5 sm:p-6">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] text-sm font-semibold text-emerald-200">{step.n}</span>
                  <div><h3 className="font-semibold text-white">{step.title}</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{step.description}</p></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="duvidas" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Perguntas frequentes</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Antes de começar</h2>
            </div>
            <div className="mt-10 divide-y divide-white/[0.08] border-y border-white/[0.08]">
              {[
                { q: 'Como acesso o Critical Cash?', a: 'Clique em “Entrar ou criar conta”. Na tela de acesso, você poderá entrar com uma conta existente ou selecionar a opção de criar conta.' },
                { q: 'O que faço se ainda não tenho cadastro?', a: 'Abra a tela de acesso e selecione “Criar Conta”. Preencha os campos solicitados e siga as instruções apresentadas pelo sistema.' },
                { q: 'A página mostra dados financeiros reais?', a: 'Não. A ilustração desta página é apenas demonstrativa. Os dados do seu ambiente ficam disponíveis após o acesso à plataforma.' },
                { q: 'Quais são os preços dos planos?', a: 'O Starter custa R$ 29 por mês ou R$ 290 por ano; o Pro custa R$ 59 por mês ou R$ 590 por ano; e o Business custa R$ 119 por mês ou R$ 1.190 por ano. O plano anual equivale a 10 mensalidades. Confira as condições finais no checkout.' },
                { q: 'Como funciona o programa para contadores afiliados?', a: 'Após criar uma conta, acesse a área Contador e envie sua solicitação com os dados e documentos exigidos. Depois da aprovação, você poderá divulgar seu cupom: os clientes recebem 20% de desconto e a comissão do contador varia de 20% a 30%, de acordo com a quantidade de clientes únicos com pagamento confirmado.' },
              ].map((item) => (
                <details key={item.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left font-medium text-zinc-200 marker:content-none">
                    {item.q}<ChevronDown className="h-4 w-4 shrink-0 text-zinc-500 transition group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 pr-8 text-sm leading-7 text-zinc-400">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-20 sm:px-8 sm:pb-24">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl border border-emerald-300/15 bg-gradient-to-br from-emerald-300/[0.10] via-[#101512] to-[#101512] px-6 py-12 text-center sm:px-12 sm:py-16">
            <div className="pointer-events-none absolute left-1/2 top-0 h-40 w-96 -translate-x-1/2 rounded-full bg-emerald-300/[0.08] blur-3xl" />
            <div className="relative">
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Traga mais clareza para a gestão do seu caixa.</h2>
              <p className="mx-auto mt-4 max-w-2xl leading-7 text-zinc-400">Acesse o Critical Cash e continue sua rotina em um ambiente dedicado à gestão financeira do seu negócio.</p>
              <Button onClick={() => handleNavigate(primaryPath)} className="mt-8 h-12 rounded-xl bg-emerald-400 px-7 text-base font-semibold text-zinc-950 hover:bg-emerald-300">
                {sessionActive ? 'Acessar meu painel' : 'Acessar / criar conta'} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.08] px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
          <a href="/" className="flex items-center gap-2 text-sm font-semibold text-white"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-300/10 text-emerald-300"><TrendingUp className="h-4 w-4" /></span>Critical Cash</a>
          <p className="text-xs leading-5 text-zinc-500">© {new Date().getFullYear()} Critical Cash. Todos os direitos reservados.</p>
          <div className="flex items-center gap-2 text-xs text-zinc-500"><LockKeyhole className="h-3.5 w-3.5 text-emerald-300" /> Acesso autenticado</div>
        </div>
      </footer>
    </div>
  );
}
