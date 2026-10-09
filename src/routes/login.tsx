import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Eye, EyeOff, Lock } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/login')({
  component: LoginComponent,
});

function LoginComponent() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Redireciona o usuário para /admin ou /caixa conforme email ou role
  const redirectUser = (sessionUser: any) => {
    if (!sessionUser) return;

    const userEmail = sessionUser.email;
    const userRole = sessionUser.user_metadata?.role;

    const isAdmin =
      userEmail === 'gabrielmansano1979@gmail.com' ||
      userRole === 'admin';

    if (isAdmin) {
      navigate({ to: '/admin' });
    } else {
      navigate({ to: '/caixa' });
    }
  };

  useEffect(() => {
    let isMounted = true;

    const processAuth = async () => {
      // 1. Se a URL contém o hash de acesso OAuth do Supabase, processa a sessão manualmente
      if (window.location.hash.includes('access_token')) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (!error && data.session?.user && isMounted) {
            // Limpa a hash da URL para não prender a rota
            window.history.replaceState(null, '', window.location.pathname);
            redirectUser(data.session.user);
            return;
          }
        }
      }

      // 2. Se já existir uma sessão salva no localStorage
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && isMounted) {
        redirectUser(session.user);
      }
    };

    processAuth();

    // 3. Monitora mudanças de estado no Auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && isMounted) {
        redirectUser(session.user);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.session?.user) {
        toast.success('Login realizado com sucesso!');
        redirectUser(data.session.user);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao realizar login. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/login`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || 'Erro ao conectar com o Google.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col justify-center items-center p-4 relative">
      <div className="absolute top-6 left-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Início
        </Link>
      </div>

      <div className="absolute top-6 right-6 flex items-center gap-2 text-xs text-slate-500">
        <Lock className="w-3 h-3" />
        Acesso seguro
      </div>

      <div className="w-full max-w-md space-y-8 bg-slate-900/50 p-8 rounded-2xl border border-slate-800 backdrop-blur-xl">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-2">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"