import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, GoogleButton, Divider, FieldError, PasswordStrength, passwordScore, translateAuthError } from "@/components/auth-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [
      { title: "Criar conta | Critical Cash" },
      { name: "description", content: "Crie sua conta e assine a partir de hoje. A primeira assinatura paga no Pix sai com 20% de desconto." },
      { property: "og:title", content: "Criar conta — Critical Cash" },
      { property: "og:description", content: "Primeira assinatura no Pix com 20% de desconto. Cancele quando quiser." },
    ],
  }),
  component: SignupPage,
});

const schema = z
  .object({
    email: z.string().trim().email("Informe um e-mail válido.").max(255),
    password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres.").max(72),
    confirm: z.string(),
  })
  .refine((d) => passwordScore(d.password) >= 2, { message: "Use letras maiúsculas, minúsculas e números.", path: ["password"] })
  .refine((d) => d.password === d.confirm, { message: "As senhas não conferem.", path: ["confirm"] });

function SignupPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState, watch } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const pw = watch("password") ?? "";

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    const { error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: { emailRedirectTo: window.location.origin + "/login" },
    });
    if (error) return setError(translateAuthError(error.message));
    setSentTo(v.email);
  });

  if (sentTo) {
    return (
      <AuthShell title="Confirme seu e-mail">
        <div className="flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-foreground"><MailCheck className="h-7 w-7" /></span>
          <p className="mt-4 text-sm text-muted-foreground">
            Enviamos um link para <strong className="text-foreground">{sentTo}</strong>. Clique nele para ativar sua conta e escolher seu plano.
          </p>
          <Link to="/login" className="mt-6 text-sm font-medium text-primary hover:underline">Ir para o login</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Crie sua conta"
      subtitle="A cobrança começa no primeiro acesso. Sua primeira assinatura no Pix tem 20% de desconto."
      footer={<>Já tem conta? <Link to="/login" className="font-medium text-primary hover:underline">Entrar</Link></>}
    >
      <GoogleButton label="Cadastrar com Google" />
      <Divider />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" className="mt-1.5 h-11 rounded-xl" {...register("email")} />
          <FieldError msg={formState.errors.email?.message} />
        </div>
        <div>
          <Label htmlFor="password">Senha</Label>
          <Input id="password" type="password" autoComplete="new-password" className="mt-1.5 h-11 rounded-xl" {...register("password")} />
          <PasswordStrength value={pw} />
          <FieldError msg={formState.errors.password?.message} />
        </div>
        <div>
          <Label htmlFor="confirm">Confirmar senha</Label>
          <Input id="confirm" type="password" autoComplete="new-password" className="mt-1.5 h-11 rounded-xl" {...register("confirm")} />
          <FieldError msg={formState.errors.confirm?.message} />
        </div>
        {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" className="h-11 w-full rounded-xl" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Criando conta…" : "Criar conta"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Ao criar a conta você aceita os <Link to="/termos" className="underline">Termos</Link> e a <Link to="/privacidade" className="underline">Política de Privacidade</Link>.
        </p>
      </form>
    </AuthShell>
  );
}
