import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { 
  ArrowRight, 
  ShieldCheck, 
  TrendingUp, 
  Wallet, 
  Lock, 
  CheckCircle2, 
  Zap, 
  BarChart3, 
  Users, 
  HelpCircle,
  Server,
  Award
} from 'lucide-react';

export const Route = createFileRoute('/')({
  component: IndexComponent,
});

function IndexComponent() {
  const [sessionActive, setSessionActive] = useState(false);
  const [userRolePath, setUserRolePath] = useState('/login');
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  useEffect(() => {
    let isMounted = true;

    const processAuthAndLanding = async () => {
      // 1. Tratamento do callback de autenticação do Google/Supabase (#access_token=...)
      if (window.location.hash && window.location.hash.includes('access_token')) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });

          if (!error && data.session?.user && isMounted) {
            const userEmail = data.session.user.email;
            const userRole = data.session.user.user_metadata?.role;
            const isAdmin = userEmail === 'gabrielmansano1979@gmail.com' || userRole === 'admin';
            
            window.location.replace(isAdmin ? '/admin' : '/caixa');
            return;
          }
        }
      }

      // 2. Verifica se o utilizador já possui sessão ativa
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && isMounted) {
        const userEmail = session.user.email;
        const userRole = session.user.user_metadata?.role;
        const isAdmin = userEmail === 'gabrielmansano1979@gmail.com' || userRole === 'admin';

        setSessionActive(true);
        setUserRolePath(isAdmin ? '/admin' : '/caixa');
      }

      if (isMounted) {
        setLoadingAuth(false);
      }
    };

    processAuthAndLanding();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleNavigate = (path: string) => {
    window.location.href = path;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col selection:bg-emerald-500 selection:text-zinc-950 font-sans antialiased">
      
      {/* NAVBAR EXECUTIVA */}
      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
              <TrendingUp className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white font-serif">Critical Cash</span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-400">
            <a href="#recursos" className="hover:text-zinc-100 transition-colors">Arquitetura</a>
            <a href="#seguranca" className="hover:text-zinc-100 transition-colors">Segurança & SLA</a>
            <a href="#planos" className="hover:text-zinc-100 transition-colors">Auditoria & Preços</a>
            <a href="#faq" className="hover:text-zinc-100 transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-4">
            {loadingAuth ? (
              <div className="text-xs text-zinc-500 animate-pulse">A verificar...</div>
            ) : sessionActive ? (
              <Button 
                onClick={() => handleNavigate(userRolePath)}
                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-950/50 transition-all transform hover:-translate-y-0.5 flex items-center gap-2"
              >
                <span>Painel Executivo</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <Button 
                  onClick={() => handleNavigate('/login')}
                  variant="ghost" 
                  className="text-zinc-300 hover:text-white hover:bg-zinc-900/80 font-medium"
                >
                  Entrar
                </Button>
                <Button 
                  onClick={() => handleNavigate('/login')}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-950/50 transition-all transform hover:-translate-y-0.5"
                >
                  Acesso Antecipado
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* HERO SECTION DE LUXO */}
      <section className="relative overflow-hidden py-28 px-6">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-1/2 right-10 w-[400px] h-[400px] bg-blue-600/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center relative z-10 space-y-8">
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-zinc-900/80 border border-amber-500/30 text-xs text-amber-400 font-semibold uppercase tracking-widest shadow-lg">
            <Award className="w-4 h-4 text-amber-400" />
            Plataforma de Auditoria & Gestão Financeira Privada
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1] font-serif">
            Controlo absoluto para <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-blue-400">decisões financeiras críticas</span>.
          </h1>

          <p className="text-lg sm:text-xl text-zinc-400 max-w-3xl mx-auto font-normal leading-relaxed">
            Arquitetura de alta precisão para fecho de caixa, auditoria em tempo real e relatórios executivos confidenciais. Projetado para operadores e líderes exigentes.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button 
              onClick={() => handleNavigate(sessionActive ? userRolePath : '/login')}
              className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-base px-9 py-4 h-auto rounded-xl shadow-xl shadow-emerald-950/80 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-3 border border-emerald-400/20"
            >
              <span>{sessionActive ? 'Aceder ao Meu Painel' : 'Iniciar Sessão Executiva'}</span>
              <ArrowRight className="w-5 h-5" />
            </Button>
            <Button 
              onClick={() => handleNavigate('#planos')}
              variant="outline"
              className="w-full sm:w-auto bg-zinc-900/60 hover:bg-zinc-800 border-white/10 text-zinc-300 font-medium text-base px-8 py-4 h-auto rounded-xl transition-all"
            >
              <span>Ver Planos & Auditoria</span>
            </Button>
          </div>

          {/* TRUST BADGES / BADGES DE CONFIANÇA */}
          <div className="pt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto" id="seguranca">
            <div className="bg-zinc-900/60 border border-white/10 p-5 rounded-2xl backdrop-blur-md flex items-center gap-4 shadow-xl">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-semibold text-white">Conformidade LGPD</h4>
                <p className="text-xs text-zinc-400">Proteção total de dados e privacidade.</p>
              </div>
            </div>

            <div className="bg-zinc-900/60 border border-white/10 p-5 rounded-2xl backdrop-blur-md flex items-center gap-4 shadow-xl">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20 shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-semibold text-white">Criptografia AES-256</h4>
                <p className="text-xs text-zinc-400">Segurança bancária de ponta a ponta.</p>
              </div>
            </div>

            <div className="bg-zinc-900/60 border border-white/10 p-5 rounded-2xl backdrop-blur-md flex items-center gap-4 shadow-xl">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 shrink-0">
                <Server className="w-5 h-5" />
              </div>
              <div className="text-left">
                <h4 className="text-sm font-semibold text-white">SLA Garantido 99.9%</h4>
                <p className="text-xs text-zinc-400">Disponibilidade ininterrupta em nuvem.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ARQUITETURA / BENTO GRID DE RECURSOS */}
      <section id="recursos" className="py-24 px-6 bg-zinc-900/20 border-y border-white/5">
        <div className="max-w-7xl mx-auto space-y-16">
          <div className="text-center space-y-4 max-w-2xl mx-auto">
            <span className="text-xs font-semibold text-emerald-400 tracking-wider uppercase">Engenharia Financeira</span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white font-serif">Projetado para eliminar divergências de caixa</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">Cada módulo foi rigorosamente testado para garantir auditoria rápida, relatórios impecáveis e separação estricta de privilégios.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-zinc-900/60 border border-white/10 p-8 rounded-2xl backdrop-blur-md space-y-4 hover:border-emerald-500/40 transition-all group shadow-xl">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 group-hover:scale-110 transition-transform">
                <Wallet className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">Fechamento Cirúrgico</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">Sangrias, suprimentos e conferência de gaveta executados em menos de 2 minutos com zero margem para discrepâncias.</p>
            </div>

            <div className="bg-zinc-900/60 border border-white/10 p-8 rounded-2xl backdrop-blur-md space-y-4 hover:border-emerald-500/40 transition-all group shadow-xl">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">Relatórios de Auditoria</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">Geração de relatórios financeiros analíticos em formato executivo, prontos para exportação e análise gerencial.</p>
            </div>

            <div className="bg-zinc-900/60 border border-white/10 p-8 rounded-2xl backdrop-blur-md space-y-4 hover:border-emerald-500/40 transition-all group shadow-xl">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 group-hover:scale-110 transition-transform">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-white">Hierarquia de Acessos</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">Painéis distintos e blindados para Operadores de Caixa e Administradores-Chefe com registo de logs.</p>
            </div>
          </div>
        </div>
      </section>

      {/* PLANOS E PREÇOS EXECUTIVOS */}
      <section id="planos" className="py-28 px-6 relative">
        <div className="max-w-7xl mx-auto space-y-16">
          <div className="text-center space-y-4 max-w-2xl mx-auto">
            <span className="text-xs font-semibold text-emerald-400 tracking-wider uppercase">Investimento Corporativo</span>
            <h2 className="text-3xl sm:text-5xl font-bold text-white font-serif">Escolha o nível de acesso ideal</h2>
            <p className="text-zinc-400 text-sm">Transparência absoluta. Cancele ou faça upgrade a qualquer momento sem taxas ocultas.</p>

            {/* Toggle de Ciclo */}
            <div className="flex items-center justify-center gap-4 pt-6">
              <span className={`text-sm ${billingCycle === 'monthly' ? 'text-white font-medium' : 'text-zinc-400'}`}>Mensal</span>
              <button 
                onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
                className="w-14 h-8 bg-zinc-900 border border-zinc-700 rounded-full p-1 relative transition-colors focus:outline-none"
              >
                <div className={`w-6 h-6 bg-emerald-500 rounded-full transition-transform ${billingCycle === 'yearly' ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
              <span className={`text-sm ${billingCycle === 'yearly' ? 'text-white font-medium' : 'text-zinc-400'}`}>
                Anual <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full ml-1">20% Desconto VIP</span>
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {/* Start */}
            <div className="bg-zinc-900/40 border border-white/10 p-8 rounded-2xl flex flex-col justify-between space-y-6 backdrop-blur-md shadow-xl">
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-white">Start Executivo</h3>
                <p className="text-xs text-zinc-400">Essencial para operações unipessoais e comércios locais.</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">
                    {billingCycle === 'monthly' ? 'R$ 49' : 'R$ 39'}
                  </span>
                  <span className="text-sm text-zinc-400">/mês</span>
                </div>
                <ul className="space-y-3 pt-4 border-t border-white/10 text-sm text-zinc-300">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> 1 Operador de Caixa</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Lançamentos Ilimitados</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Relatórios Diários</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Suporte Padrão</li>
                </ul>
              </div>
              <Button 
                onClick={() => handleNavigate('/login')}
                variant="outline" 
                className="w-full border-white/10 bg-zinc-900/80 hover:bg-zinc-800 text-white font-medium"
              >
                Subscrito Start
              </Button>
            </div>

            {/* Pro (Destaque VIP) */}
            <div className="bg-zinc-900/90 border-2 border-emerald-500 p-8 rounded-2xl flex flex-col justify-between space-y-6 relative shadow-2xl shadow-emerald-950/60 backdrop-blur-md">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-zinc-950 text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wider">
                Recomendado VIP
              </div>
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-white">Pro Enterprise</h3>
                <p className="text-xs text-zinc-400">Solução avançada para estabelecimentos em crescimento.</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">
                    {billingCycle === 'monthly' ? 'R$ 99' : 'R$ 79'}
                  </span>
                  <span className="text-sm text-zinc-400">/mês</span>
                </div>
                <ul className="space-y-3 pt-4 border-t border-white/10 text-sm text-zinc-300">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Até 5 Caixas simultâneos</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Painel de Auditoria Avançado</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Exportação PDF & Excel</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Suporte Prioritário WhatsApp</li>
                </ul>
              </div>
              <Button 
                onClick={() => handleNavigate('/login')}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold shadow-lg shadow-emerald-950/50"
              >
                Começar 7 Dias de Teste
              </Button>
            </div>

            {/* Enterprise */}
            <div className="bg-zinc-900/40 border border-white/10 p-8 rounded-2xl flex flex-col justify-between space-y-6 backdrop-blur-md shadow-xl">
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-white">Corporate</h3>
                <p className="text-xs text-zinc-400">Para redes de lojas e filiais múltiplas.</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-white">
                    {billingCycle === 'monthly' ? 'R$ 199' : 'R$ 159'}
                  </span>
                  <span className="text-sm text-zinc-400">/mês</span>
                </div>
                <ul className="space-y-3 pt-4 border-t border-white/10 text-sm text-zinc-300">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Caixas e Utilizadores Ilimitados</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Multi-filiais e CNPJs</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> API de Integração Dedicada</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Gestor de Conta Exclusivo</li>
                </ul>
              </div>
              <Button 
                onClick={() => handleNavigate('/login')}
                variant="outline" 
                className="w-full border-white/10 bg-zinc-900/80 hover:bg-zinc-800 text-white font-medium"
              >
                Falar com Consultor
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 px-6 bg-zinc-900/20 border-t border-white/5">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-bold text-white font-serif">Perguntas Frequentes</h2>
            <p className="text-zinc-400 text-sm">Esclarecimentos sobre segurança, conformidade e faturamento.</p>
          </div>

          <div className="space-y-4">
            <div className="bg-zinc-900/60 border border-white/10 p-6 rounded-xl space-y-2 backdrop-blur-md shadow-lg">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-emerald-400" />
                Preciso de cartão de crédito para iniciar o teste?
              </h3>
              <p className="text-sm text-zinc-400 pl-6">Não. O acesso aos 7 dias de avaliação executiva é liberado instantaneamente sem necessidade de dados bancários.</p>
            </div>

            <div className="bg-zinc-900/60 border border-white/10 p-6 rounded-xl space-y-2 backdrop-blur-md shadow-lg">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-emerald-400" />
                Como funciona a segurança e privacidade dos dados?
              </h3>
              <p className="text-sm text-zinc-400 pl-6">Todos os registos são encriptados com padrão AES-256 em servidores dedicados e cumprem rigorosamente os requisitos da LGPD.</p>
            </div>

            <div className="bg-zinc-900/60 border border-white/10 p-6 rounded-xl space-y-2 backdrop-blur-md shadow-lg">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-emerald-400" />
                Posso cancelar a subscrição a qualquer momento?
              </h3>
              <p className="text-sm text-zinc-400 pl-6">Sim. O cancelamento é executado com um único clique diretamente no painel de administração, sem taxas de rescisão.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER EXECUTIVO */}
      <footer className="border-t border-white/10 py-12 bg-zinc-950 text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <span className="text-sm font-bold text-white font-serif">Critical Cash</span>
          </div>

          <div className="flex items-center gap-6 text-zinc-400">
            <a href="#recursos" className="hover:text-white transition-colors">Arquitetura</a>
            <a href="#planos" className="hover:text-white transition-colors">Preços</a>
            <button onClick={() => handleNavigate('/login')} className="hover:text-white bg-transparent border-none cursor-pointer">Login</button>
          </div>

          <div className="flex items-center gap-2 text-zinc-500">
            <Lock className="w-3.5 h-3.5 text-emerald-500" />
            <span>© {new Date().getFullYear()} Critical Cash. Todos os direitos reservados. Ambiente Seguro.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}