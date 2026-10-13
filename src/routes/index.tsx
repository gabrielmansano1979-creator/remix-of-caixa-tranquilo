import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ArrowRight, ShieldCheck, TrendingUp, Wallet, Lock, CheckCircle2, BarChart3, Users, HelpCircle, Server, Award } from 'lucide-react';

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
      // 1. Verifica se há sessão ativa e redireciona direto se for admin
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && isMounted) {
        // Acesso administrativo é decidido exclusivamente pela função persistida
        // no banco; e-mail e user_metadata não concedem privilégios.
        const { data: adminRole, error: roleError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', session.user.id)
          .eq('role', 'admin')
          .maybeSingle();

        if (!isMounted) return;

        if (roleError) {
          console.error('[HOME] Não foi possível verificar a função administrativa:', roleError);
        }

        if (!roleError && adminRole?.role === 'admin') {
          window.location.replace('/admin');
          return;
        }

        setSessionActive(true);
        setUserRolePath('/caixa');
      }

      if (isMounted) {
        setLoadingAuth(false);
      }
    };

    void processAuthAndLanding();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleNavigate = (path: string) => {
    window.location.href = path;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans antialiased">
      {/* NAVBAR */}
      <header className="border-b border-white/10 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white font-serif">Critical Cash</span>
          </div>

          <div className="flex items-center gap-4">
            {loadingAuth ? (
              <div className="text-xs text-zinc-500 animate-pulse">A verificar...</div>
            ) : sessionActive ? (
              <Button 
                onClick={() => handleNavigate(userRolePath)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5 py-2.5 rounded-xl shadow-lg flex items-center gap-2"
              >
                <span>Painel Executivo</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <Button 
                  onClick={() => handleNavigate('/login')}
                  variant="ghost" 
                  className="text-zinc-300 hover:text-white font-medium"
                >
                  Entrar
                </Button>
                <Button 
                  onClick={() => handleNavigate('/login')}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5 py-2.5 rounded-xl shadow-lg"
                >
                  Acesso Antecipado
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden py-28 px-6">
        <div className="max-w-5xl mx-auto text-center relative z-10 space-y-8">
          <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-zinc-900 border border-amber-500/30 text-xs text-amber-400 font-semibold uppercase tracking-widest shadow-lg">
            <Award className="w-4 h-4 text-amber-400" />
            Plataforma de Auditoria & Gestão Financeira Privada
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-[1.1] font-serif">
            Controlo absoluto para <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">decisões financeiras críticas</span>.
          </h1>

          <p className="text-lg sm:text-xl text-zinc-400 max-w-3xl mx-auto font-normal leading-relaxed">
            Arquitetura de alta precisão para fecho de caixa, auditoria em tempo real e relatórios executivos confidenciais.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button 
              onClick={() => handleNavigate(sessionActive ? userRolePath : '/login')}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-base px-9 py-4 h-auto rounded-xl shadow-xl flex items-center justify-center gap-3"
            >
              <span>{sessionActive ? 'Aceder ao Meu Painel' : 'Iniciar Sessão Executiva'}</span>
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/10 py-12 bg-zinc-950 text-xs text-zinc-500 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <span className="text-sm font-bold text-white font-serif">Critical Cash</span>
          <div className="flex items-center gap-2 text-zinc-500">
            <Lock className="w-3.5 h-3.5 text-emerald-500" />
            <span>© {new Date().getFullYear()} Critical Cash. Todos os direitos reservados.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}