import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Eye, EyeOff, Lock, User, Building, Phone } from 'lucide-react';
import { toast } from 'sonner';

export const Route = createFileRoute('/login')({
component: LoginComponent,
});

function LoginComponent() {
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [confirmPassword, setConfirmPassword] = useState('');
const [fullName, setFullName] = useState('');
const [companyName, setCompanyName] = useState('');
const [phone, setPhone] = useState('');

const [showPassword, setShowPassword] = useState(false);
const [loading, setLoading] = useState(false);
const [isRegistering, setIsRegistering] = useState(false);

const redirectUser = async (sessionUser: any) => {
if (!sessionUser) return;

const userEmail = sessionUser.email?.toLowerCase().trim();
const userRole = sessionUser.user_metadata?.role;

const isAdmin =
userEmail === 'gabrielmansano1979@gmail.com' ||
userRole === 'admin';

const targetPath = isAdmin ? '/admin' : '/caixa';

if (window.location.pathname !== targetPath) {
window.location.replace(targetPath);
}
};

useEffect(() => {
let isMounted = true;

const processAuth = async () => {
const urlParams = new URLSearchParams(window.location.search);
const authCode = urlParams.get('code');

if (authCode) {
  await new Promise((resolve) => setTimeout(resolve, 500));
}

const { data: { session } } = await supabase.auth.getSession();
if (session?.user && isMounted) {
  await redirectUser(session.user);
}
};

void processAuth();

const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
if (session?.user && isMounted) {
  await redirectUser(session.user);
}
});

return () => {
isMounted = false;
subscription.unsubscribe();
};
}, []);


const handleSubmit = async (e: React.FormEvent) => {
e.preventDefault();
setLoading(true);
console.log('[LOGIN] handleSubmit foi iniciado');

try {
if (isRegistering) {
  if (password !== confirmPassword) {
    toast.error('As senhas não coincidem.');
    setLoading(false);
    return;
  }

  const { error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        full_name: fullName,
        company_name: companyName,
        phone: phone,
        role: 'caixa',
      },
    },
  });

  if (error) throw error;

  toast.success('Conta criada com sucesso! Faça login para continuar.');
  setIsRegistering(false);
} else {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) throw error;

  if (data.session?.user) {
    toast.success('Login realizado com sucesso!');
    await redirectUser(data.session.user);
  }
}
} catch (err: any) {
toast.error(err.message || 'Ocorreu um erro ao processar sua solicitação.');
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
<div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col justify-center items-center p-4 relative py-12">
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

<div className="w-full max-w-lg space-y-6 bg-slate-900/50 p-8 rounded-2xl border border-slate-800 backdrop-blur-xl shadow-2xl">
  <div className="text-center space-y-3">
    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mb-2">
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    </div>
    <h1 className="text-2xl font-bold tracking-tight text-white">Critical Cash</h1>
    <h2 className="text-xl font-semibold text-slate-200">
      {isRegistering ? 'Criar Nova Conta' : 'Bem-vindo de volta'}
    </h2>
    <p className="text-sm text-slate-400">
      {isRegistering ? 'Preencha os dados abaixo para registrar seu estabelecimento.' : 'Entre na sua conta para acompanhar seu caixa.'}
    </p>
  </div>

  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
    <button
      type="button"
      onClick={() => setIsRegistering(false)}
      className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${!isRegistering ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
    >
      Entrar
    </button>
    <button
      type="button"
      onClick={() => setIsRegistering(true)}
      className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${isRegistering ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
    >
      Criar Conta
    </button>
  </div>

  <div className="space-y-4">
    <Button
      type="button"
      variant="outline"
      className="w-full py-5 bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200 flex items-center justify-center gap-3"
      onClick={handleGoogleLogin}
      disabled={loading}
    >
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
      </svg>
      {isRegistering ? 'Cadastrar com o Google' : 'Continuar com o Google'}
    </Button>

    <div className="relative my-4">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-slate-800" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-slate-950 px-2 text-slate-500">ou com e-mail</span>
      </div>
    </div>

    <form onSubmit={handleSubmit} className="space-y-4">
      {isRegistering && (
        <>
          <div className="space-y-2">
            <Label htmlFor="fullName" className="text-slate-300 flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-emerald-400" /> Nome Completo
            </Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Seu nome"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="bg-slate-900/80 border-slate-800 text-slate-100 focus:border-emerald-500 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyName" className="text-slate-300 flex items-center gap-2">
              <Building className="w-3.5 h-3.5 text-emerald-400" /> Nome da Empresa / Estabelecimento
            </Label>
            <Input
              id="companyName"
              type="text"
              placeholder="Nome da sua empresa ou negócio"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              className="bg-slate-900/80 border-slate-800 text-slate-100 focus:border-emerald-500 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone" className="text-slate-300 flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-emerald-400" /> Telefone / WhatsApp
            </Label>
            <Input
              id="phone"
              type="tel"
              placeholder="(21) 99999-9999"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="bg-slate-900/80 border-slate-800 text-slate-100 focus:border-emerald-500 focus:ring-emerald-500"
            />
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="email" className="text-slate-300">E-mail</Label>
        <Input
          id="email"
          type="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="bg-slate-900/80 border-slate-800 text-slate-100 focus:border-emerald-500 focus:ring-emerald-500"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-slate-300">Senha</Label>
          {!isRegistering && (
            <Link to="/esqueci-senha" className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
              Esqueci a senha
            </Link>
          )}
        </div>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Mínimo de 6 caracteres"
            className="bg-slate-900/80 border-slate-800 text-slate-100 pr-10 focus:border-emerald-500 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isRegistering && (
        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-slate-300">Confirmar Senha</Label>
          <Input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            placeholder="Repita a senha"
            className="bg-slate-900/80 border-slate-800 text-slate-100 focus:border-emerald-500 focus:ring-emerald-500"
          />
        </div>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg transition-colors mt-2 shadow-lg shadow-emerald-950/50"
      >
        {loading ? (isRegistering ? 'Criando conta...' : 'Entrando...') : (isRegistering ? 'Concluir Cadastro' : 'Entrar')}
      </Button>
    </form>
  </div>
</div>
</div>
);
}