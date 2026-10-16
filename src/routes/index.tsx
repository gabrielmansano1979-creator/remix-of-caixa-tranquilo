import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, BarChart3, Check, ChevronDown, CircleHelp, Clock3, FileSpreadsheet,
  LockKeyhole, Menu, MessageCircle, ShieldCheck, TrendingUp, Wallet, X,
} from 'lucide-react';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Critical Cash | Previsão e controle de caixa' },
      { name: 'description', content: 'Organize contas a receber, antecipe riscos de caixa e prepare cobranças pelo WhatsApp com o Critical Cash.' },
    ],
  }),
  component: IndexComponent,
});

const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(cents / 100);

const plans = [
  { name: 'Starter', priceMonth: 2900, priceYear: 29000, limit: 'Até 100 contas pendentes', features: ['Cobranças manuais pelo WhatsApp', 'Importação CSV de até 100 linhas', 'Régua padrão com 4 etapas', 'Projeção de caixa de 15 e 30 dias', 'Visão das 3 maiores exposições'], featured: false },
  { name: 'Pro', priceMonth: 5900, priceYear: 59000, limit: 'Até 500 contas pendentes', features: ['Tudo do Starter', 'Importação CSV de até 500 linhas', 'Personalize dias e etapas da régua', 'Visão das 5 maiores exposições', 'Suporte prioritário'], featured: true },
  { name: 'Business', priceMonth: 11900, priceYear: 119000, limit: 'Até 2.000 contas pendentes', features: ['Tudo do Pro', 'Importação CSV de até 2.000 linhas', 'Personalize mensagens e etapas', 'Visão das 10 maiores exposições', 'Suporte prioritário'], featured: false },
];

function IndexComponent() {
  const [sessionActive, setSessionActive] = useState(false);
  const [userRolePath, setUserRolePath] = useState('/login');
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    let isMounted = true;
    const processAuthAndLanding = async () => {
      try {
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
      } catch (error) {
        // A página pública continua disponível mesmo se a consulta de sessão falhar.
        console.error('[HOME] Não foi possível consultar a sessão:', error);
      } finally {
        if (isMounted) setLoadingAuth(false);
      }
    };
    void processAuthAndLanding();
    return () => { isMounted = false; };
  }, []);

  const handleNavigate = (path = '/login') => { window.location.href = path; };
  const ctaLabel = sessionActive ? 'Abrir meu painel' : 'Começar agora';
  const faqs = [
    { q: 'O Critical Cash envia cobranças automaticamente?', a: 'Não. A ferramenta prepara a mensagem e abre o WhatsApp para você revisar e confirmar o envio. Ela não dispara mensagens por conta própria.' },
    { q: 'Posso importar meus dados?', a: 'Sim. Você pode importar contas por arquivo CSV, respeitando o limite de linhas do seu plano. Revise os dados antes de concluir a importação.' },
    { q: 'O que a projeção de caixa mostra?', a: 'Ela organiza as contas pendentes para ajudar você a visualizar os próximos 15 e 30 dias e priorizar os riscos de recebimento.' },
    { q: 'Preciso cadastrar cartão para testar?', a: 'O produto está configurado para oferecer um período de teste de 7 dias sem cartão. As condições exibidas no cadastro e na contratação devem ser conferidas antes de concluir a assinatura.' },
    { q: 'Meus dados ficam públicos?', a: 'O Critical Cash foi desenvolvido para uso autenticado. Consulte a Política de Privacidade e os Termos de Uso para entender o tratamento dos dados e as responsabilidades de cada parte.' },
  ];

  return (
    <div className="min-h-screen bg-[#080d0b] text-zinc-100 font-sans antialiased selection:bg-emerald-400/30">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#080d0b]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <a href="/" className="flex items-center gap-3" aria-label="Critical Cash — início">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-300"><TrendingUp className="h-5 w-5" /></span>
            <span className="text-xl font-bold tracking-tight text-white">Critical<span className="text-emerald-300"> Cash</span></span>
          </a>
          <nav className="hidden items-center gap-8 text-sm text-zinc-300 md:flex" aria-label="Navegação principal">
            <a className="transition hover:text-emerald-300" href="#recursos">Recursos</a>
            <a className="transition hover:text-emerald-300" href="#como-funciona">Como funciona</a>
            <a className="transition hover:text-emerald-300" href="#planos">Planos</a>
            <a className="transition hover:text-emerald-300" href="#duvidas">Dúvidas</a>
          </nav>
          <div className="hidden items-center gap-3 md:flex">
            {!loadingAuth && !sessionActive && <Button variant="ghost" onClick={() => handleNavigate('/login')} className="text-zinc-300 hover:bg-white/5 hover:text-white">Entrar</Button>}
            <Button onClick={() => handleNavigate(sessionActive ? userRolePath : '/login')} className="rounded-xl bg-emerald-400 px-5 font-semibold text-zinc-950 shadow-lg shadow-emerald-950/30 hover:bg-emerald-300">{loadingAuth ? 'Carregando…' : ctaLabel}<ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
          <button type="button" aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="rounded-lg p-2 text-zinc-200 hover:bg-white/10 md:hidden">{mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
        </div>
        {mobileMenuOpen && <nav className="border-t border-white/10 px-5 py-4 md:hidden" aria-label="Menu móvel">
          {['#recursos', '#como-funciona', '#planos', '#duvidas'].map((href) => <a key={href} href={href} onClick={() => setMobileMenuOpen(false)} className="block py-3 text-sm text-zinc-300">{({ '#recursos': 'Recursos', '#como-funciona': 'Como funciona', '#planos': 'Planos', '#duvidas': 'Dúvidas' } as Record<string, string>)[href]}</a>)}
          <Button onClick={() => handleNavigate(sessionActive ? userRolePath : '/login')} className="mt-2 w-full bg-emerald-400 font-semibold text-zinc-950 hover:bg-emerald-300">{ctaLabel}<ArrowRight className="ml-2 h-4 w-4" /></Button>
        </nav>}
      </header>

      <main>
        <section className="relative isolate overflow-hidden px-5 pb-24 pt-20 sm:px-8 sm:pb-32 sm:pt-28">
          <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute left-1/2 top-0 h-[520px] w-[760px] -translate-x-1/2 rounded-full bg-emerald-500/[0.09] blur-[120px]" />
            <div className="absolute right-0 top-48 h-64 w-64 rounded-full bg-teal-500/[0.06] blur-[100px]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
          </div>
          <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="max-w-2xl">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-4 py-2 text-xs font-semibold tracking-wide text-emerald-200"><ShieldCheck className="h-4 w-4" /> Clareza para decidir. Controle para agir.</div>
              <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-6xl lg:text-[4.25rem]">Seu caixa, com <span className="text-emerald-300">visão de futuro.</span></h1>
              <p className="mt-7 max-w-xl text-base leading-8 text-zinc-400 sm:text-lg">Organize contas a receber, antecipe riscos e saiba onde concentrar seus esforços — sem perder horas em planilhas dispersas.</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button onClick={() => handleNavigate(sessionActive ? userRolePath : '/login')} className="h-12 rounded-xl bg-emerald-400 px-6 text-base font-semibold text-zinc-950 shadow-xl shadow-emerald-950/40 hover:bg-emerald-300">{ctaLabel}<ArrowRight className="ml-2 h-5 w-5" /></Button>
                <a href="#recursos" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 px-6 text-sm font-medium text-zinc-200 transition hover:border-white/30 hover:bg-white/5">Conhecer recursos</a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-zinc-400">
                <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" /> Teste de 7 dias</span>
                <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" /> Sem cartão no teste</span>
                <span className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-emerald-300" /> Você confirma os envios</span>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -inset-5 rounded-[2rem] bg-emerald-400/[0.07] blur-2xl" />
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#101815] shadow-2xl shadow-black/40">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <div><p className="text-xs text-zinc-500">VISÃO EXECUTIVA</p><p className="mt-1 font-semibold text-white">Resumo do caixa</p></div>
                  <span className="rounded-lg border border-emerald-300/15 bg-emerald-300/10 px-3 py-1.5 text-xs text-emerald-200">Exemplo ilustrativo</span>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 sm:p-5">
                  <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4"><Wallet className="h-4 w-4 text-emerald-300" /><p className="mt-4 text-xs text-zinc-500">Contas a receber</p><p className="mt-1 text-xl font-semibold text-white sm:text-2xl">Organizadas</p><p className="mt-1 text-xs text-zinc-500">Por vencimento e prioridade</p></div>
                  <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4"><BarChart3 className="h-4 w-4 text-teal-300" /><p className="mt-4 text-xs text-zinc-500">Horizonte de análise</p><p className="mt-1 text-xl font-semibold text-white sm:text-2xl">15 / 30 dias</p><p className="mt-1 text-xs text-zinc-500">Projeção de caixa</p></div>
                </div>
                <div className="mx-4 mb-4 rounded-xl border border-white/8 bg-black/20 p-4 sm:mx-5 sm:mb-5">
                  <div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-medium text-white">Prioridades do dia</p><p className="mt-1 text-xs text-zinc-500">Um fluxo de trabalho mais organizado</p></div><Clock3 className="h-5 w-5 text-emerald-300" /></div>
                  {['Revise contas próximas do vencimento', 'Prepare mensagens de cobrança', 'Acompanhe os riscos de recebimento'].map((item, i) => <div key={item} className="flex items-center gap-3 border-t border-white/8 py-3 first:border-0"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-300/10 text-xs font-semibold text-emerald-200">{String(i + 1).padStart(2, '0')}</span><span className="text-sm text-zinc-300">{item}</span><Check className="ml-auto h-4 w-4 text-zinc-600" /></div>)}
                </div>
              </div>
              <p className="mt-3 text-center text-xs text-zinc-600">Prévia conceitual da proposta do produto; não representa dados reais de uma conta.</p>
            </div>
          </div>
        </section>

        <section id="recursos" className="scroll-mt-24 border-y border-white/8 bg-white/[0.018] px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center"><p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">Feito para a rotina financeira</p><h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Menos improviso. Mais previsibilidade.</h2><p className="mt-5 leading-7 text-zinc-400">Ferramentas práticas para transformar uma lista de recebimentos em prioridades claras.</p></div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: BarChart3, title: 'Projeção de caixa', text: 'Visualize contas pendentes em horizontes de 15 e 30 dias para se preparar melhor.' },
                { icon: Wallet, title: 'Gestão de recebíveis', text: 'Organize vencimentos e identifique as contas que merecem atenção primeiro.' },
                { icon: MessageCircle, title: 'Cobranças pelo WhatsApp', text: 'Prepare mensagens com links oficiais e revise tudo antes de confirmar o envio.' },
                { icon: FileSpreadsheet, title: 'Importação CSV', text: 'Traga seus dados por arquivo e reduza o trabalho de cadastro manual.' },
              ].map(({ icon: Icon, title, text }) => <article key={title} className="rounded-2xl border border-white/10 bg-[#0d1310] p-6 transition hover:-translate-y-1 hover:border-emerald-300/25"><span className="flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-200"><Icon className="h-5 w-5" /></span><h3 className="mt-5 text-lg font-semibold text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-zinc-400">{text}</p></article>)}
            </div>
          </div>
        </section>

        <section id="como-funciona" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2 lg:items-center">
            <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">Simples por design</p><h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Uma rotina financeira mais clara, passo a passo.</h2><p className="mt-5 leading-7 text-zinc-400">O Critical Cash ajuda a estruturar o trabalho; as decisões e os envios continuam sob seu controle.</p><Button onClick={() => handleNavigate(sessionActive ? userRolePath : '/login')} className="mt-7 rounded-xl bg-emerald-400 px-5 font-semibold text-zinc-950 hover:bg-emerald-300">{ctaLabel}<ArrowRight className="ml-2 h-4 w-4" /></Button></div>
            <div className="space-y-4">
              {[{ n: '01', title: 'Organize seus recebíveis', text: 'Cadastre ou importe contas pendentes e mantenha os vencimentos em um só fluxo.' }, { n: '02', title: 'Enxergue o que vem pela frente', text: 'Use as projeções e a priorização de riscos para planejar os próximos dias.' }, { n: '03', title: 'Prepare e revise as cobranças', text: 'Edite a mensagem, abra o WhatsApp e confirme o envio por conta própria.' }].map(step => <div key={step.n} className="flex gap-5 rounded-2xl border border-white/10 bg-white/[0.025] p-5 sm:p-6"><span className="text-sm font-bold text-emerald-300">{step.n}</span><div><h3 className="font-semibold text-white">{step.title}</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{step.text}</p></div></div>)}
            </div>
          </div>
        </section>

        <section id="planos" className="scroll-mt-24 border-y border-white/8 bg-white/[0.018] px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center"><p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-300">Planos transparentes</p><h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Escolha o tamanho certo para sua operação.</h2><p className="mt-5 leading-7 text-zinc-400">Comece com um teste de 7 dias e escolha o plano conforme o volume de contas que precisa acompanhar.</p>
              <div className="mx-auto mt-7 inline-flex rounded-xl border border-white/10 bg-black/20 p-1"><button type="button" aria-pressed={billingCycle === 'monthly'} onClick={() => setBillingCycle('monthly')} className={`rounded-lg px-4 py-2 text-sm transition ${billingCycle === 'monthly' ? 'bg-emerald-300 text-zinc-950' : 'text-zinc-400 hover:text-white'}`}>Mensal</button><button type="button" aria-pressed={billingCycle === 'yearly'} onClick={() => setBillingCycle('yearly')} className={`rounded-lg px-4 py-2 text-sm transition ${billingCycle === 'yearly' ? 'bg-emerald-300 text-zinc-950' : 'text-zinc-400 hover:text-white'}`}>Anual</button></div>
            </div>
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {plans.map(plan => <article key={plan.name} className={`relative flex flex-col rounded-2xl border p-6 sm:p-7 ${plan.featured ? 'border-emerald-300/50 bg-emerald-300/[0.055] shadow-xl shadow-emerald-950/20' : 'border-white/10 bg-[#0d1310]'}`}>
                {plan.featured && <span className="absolute right-5 top-5 rounded-full bg-emerald-300 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-zinc-950">Mais escolhido</span>}
                <h3 className="text-lg font-semibold text-white">{plan.name}</h3><p className="mt-2 text-sm text-zinc-400">{plan.limit}</p>
                <div className="mt-6"><span className="text-4xl font-semibold tracking-tight text-white">{money(billingCycle === 'monthly' ? plan.priceMonth : plan.priceYear)}</span><span className="ml-2 text-sm text-zinc-500">/{billingCycle === 'monthly' ? 'mês' : 'ano'}</span></div>
                {billingCycle === 'yearly' && <p className="mt-2 text-xs text-emerald-200">Equivalente a {money(Math.round(plan.priceYear / 12))}/mês, cobrado anualmente.</p>}
                <div className="my-6 border-t border-white/10" /><ul className="flex-1 space-y-3">{plan.features.map(feature => <li key={feature} className="flex gap-3 text-sm leading-5 text-zinc-300"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />{feature}</li>)}</ul>
                <Button onClick={() => handleNavigate(sessionActive ? userRolePath : '/login')} className={`mt-8 h-11 w-full rounded-xl font-semibold ${plan.featured ? 'bg-emerald-300 text-zinc-950 hover:bg-emerald-200' : 'border border-white/15 bg-transparent text-white hover:bg-white/5'}`}>Começar com {plan.name}<ArrowRight className="ml-2 h-4 w-4" /></Button>
              </article>)}
            </div>
            <p className="mx-auto mt-6 max-w-3xl text-center text-xs leading-5 text-zinc-500">Os valores exibidos são os preços de referência cadastrados no produto. Confirme as condições, a forma de pagamento e a cobrança final na tela de contratação antes de assinar.</p>
          </div>
        </section>

        <section id="duvidas" className="scroll-mt-24 px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-3xl"><div className="text-center"><CircleHelp className="mx-auto h-7 w-7 text-emerald-300" /><h2 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Dúvidas frequentes</h2><p className="mt-4 text-zinc-400">Informação clara antes de você começar.</p></div>
            <div className="mt-10 divide-y divide-white/10 border-y border-white/10">{faqs.map((faq, i) => <div key={faq.q}><button type="button" aria-expanded={openFaq === i} onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between gap-4 py-5 text-left text-sm font-medium text-white sm:text-base"><span>{faq.q}</span><ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} /></button>{openFaq === i && <p className="max-w-2xl pb-5 pr-8 text-sm leading-6 text-zinc-400">{faq.a}</p>}</div>)}</div>
          </div>
        </section>

        <section className="px-5 pb-20 sm:px-8 sm:pb-24"><div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 rounded-3xl border border-emerald-300/20 bg-gradient-to-br from-emerald-300/[0.10] to-teal-300/[0.025] p-7 sm:p-10 md:flex-row md:items-center"><div><h2 className="text-2xl font-semibold text-white sm:text-3xl">Dê mais clareza às suas decisões.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">Comece organizando seus recebíveis e tenha uma visão mais prática do que precisa de atenção.</p></div><Button onClick={() => handleNavigate(sessionActive ? userRolePath : '/login')} className="h-12 shrink-0 rounded-xl bg-emerald-300 px-6 font-semibold text-zinc-950 hover:bg-emerald-200">{ctaLabel}<ArrowRight className="ml-2 h-4 w-4" /></Button></div></section>
      </main>

      <footer className="border-t border-white/10 bg-black/20 px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-7 sm:flex-row sm:items-center sm:justify-between">
          <div><a href="/" className="text-lg font-bold text-white">Critical<span className="text-emerald-300"> Cash</span></a><p className="mt-2 max-w-md text-xs leading-5 text-zinc-500">Organização de recebíveis e apoio à previsão de caixa. As projeções dependem da qualidade e atualização dos dados informados.</p></div>
          <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-zinc-400"><a href="/termos" className="hover:text-white">Termos de Uso</a><a href="/privacidade" className="hover:text-white">Política de Privacidade</a><a href="/login" className="hover:text-white">Acessar conta</a></div>
        </div>
        <div className="mx-auto mt-8 flex max-w-7xl flex-col gap-2 border-t border-white/8 pt-5 text-xs text-zinc-600 sm:flex-row sm:items-center sm:justify-between"><span>© {new Date().getFullYear()} Critical Cash. Todos os direitos reservados.</span><span className="inline-flex items-center gap-2"><LockKeyhole className="h-3.5 w-3.5" /> Acesso à área de gestão mediante autenticação</span></div>
      </footer>
    </div>
  );
}
