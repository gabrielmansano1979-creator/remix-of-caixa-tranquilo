import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, GoogleButton, Divider, FieldError, translateAuthError } from "@/components/auth-shell";
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
    <AuthShell
      title="Entrar"
      subtitle="Bem-vindo de volta."
      footer={<>Ainda não tem conta? <Link to="/cadastro" className="font-medium text-primary underline-offset-4 hover:underline">Criar conta</Link></>}
    >
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
          <Input id="password" type="password" autoComplete="current-password" className="mt-1.5 h-11 rounded-xl" {...register("password")} />
          <FieldError msg={formState.errors.password?.message} />
        </div>
        {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" className="h-11 w-full rounded-xl" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </AuthShell>
  );
}
