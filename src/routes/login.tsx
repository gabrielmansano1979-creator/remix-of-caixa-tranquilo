import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GoogleButton, Divider, FieldError, translateAuthError } from "@/components/auth-shell";
import { ArrowLeft, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import appIcon from "@/assets/app-icon-v2.png.asset.json";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Critical Cash" },
      { name: "description", content: "Acesse sua conta do Critical Cash." },
      { property: "og:title", content: "Entrar — Critical Cash" },
      { property: "og:description", content: "Acesse sua conta do Critical Cash." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe sua senha."),
});

function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/caixa", replace: true });
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/caixa", replace: true });
    });
    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    const { error } = await supabase.auth.signInWithPassword(v);
    if (error) setError(translateAuthError(error.message));
  });

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b px-5 py-4 sm:px-8">
        <Button asChild variant="ghost" className="h-11 gap-2"><Link to="/"><ArrowLeft className="h-4 w-4" />Início</Link></Button>
        <span className="flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="h-4 w-4" />Acesso seguro</span>
      </header>
      <section className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-10 sm:py-14" aria-labelledby="login-title">
        <Link to="/" className="mb-7 flex flex-col items-center gap-3 text-xl font-semibold">
          <img src={appIcon.url} alt="Logo do Critical Cash" width={512} height={512} className="h-20 w-20 object-contain" />
          <span>Critical Cash</span>
        </Link>
        <h1 id="login-title" className="text-center text-2xl font-semibold">Bem-vindo de volta</h1>
        <p className="mb-7 mt-2 text-center text-sm text-muted-foreground">Entre na sua conta para acompanhar seu caixa.</p>
      <GoogleButton />
      <Divider />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" className="mt-1.5 h-11 rounded-xl" {...register("email")} />
          <FieldError msg={formState.errors.email?.message} />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Senha</Label>
            <Link to="/esqueci-senha" className="text-sm text-primary hover:underline">Esqueci a senha</Link>
          </div>
          <div className="relative mt-1.5">
            <Input id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" className="h-11 rounded-xl pr-12" {...register("password")} />
            <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0 h-11 w-11" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <FieldError msg={formState.errors.password?.message} />
        </div>
        {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" className="h-11 w-full rounded-xl" disabled={formState.isSubmitting}>
          {formState.isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {formState.isSubmitting ? "Entrando…" : "Entrar"}
        </Button>
      </form>
        <p className="mt-7 text-center text-sm text-muted-foreground">Ainda não tem conta? <Link to="/cadastro" className="font-medium text-primary underline-offset-4 hover:underline">Criar conta</Link></p>
      </section>
      <footer className="px-6 pb-6 text-center text-xs text-muted-foreground"><Link to="/privacidade" className="hover:underline">Privacidade</Link><span className="mx-3" aria-hidden="true">·</span><Link to="/termos" className="hover:underline">Termos de uso</Link></footer>
    </main>
  );
}
