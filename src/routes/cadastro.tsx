import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AuthShell,
  GoogleButton,
  Divider,
  FieldError,
  PasswordStrength,
  passwordScore,
  translateAuthError,
} from "@/components/auth-shell";
import { toE164 } from "@/lib/phone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/cadastro")({
  validateSearch: z.object({ ref: z.string().trim().max(80).optional(), contador_convite: z.string().uuid().optional() }),
  head: () => ({
    meta: [
      { title: "Criar conta | Critical Cash" },
      { name: "description", content: "Teste o Critical Cash por 14 dias sem cartão de crédito." },
      { property: "og:title", content: "Criar conta — Critical Cash" },
      { property: "og:description", content: "Comece seu teste de 14 dias sem cartão." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignupPage,
});

const schema = z
  .object({
    full_name: z.string().trim().min(2, "Informe seu nome.").max(120),
    business_name: z.string().trim().min(2, "Informe o nome do negócio.").max(120),
    whatsapp: z
      .string()
      .max(25)
      .refine((v) => !!toE164(v), "Informe um WhatsApp com DDD."),
    email: z.string().trim().email("Informe um e-mail válido.").max(255),
    password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres.").max(72),
    confirm: z.string(),
  })
  .refine((d) => passwordScore(d.password) >= 2, {
    message: "Use letras maiúsculas, minúsculas e números.",
    path: ["password"],
  })
  .refine((d) => d.password === d.confirm, {
    message: "As senhas não conferem.",
    path: ["confirm"],
  });

function SignupPage() {
  const { ref, contador_convite } = Route.useSearch();
  const navigate = useNavigate();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState, watch } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
  });
  const pw = watch("password") ?? "";

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: v.email,
        password: v.password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: {
            full_name: v.full_name,
            business_name: v.business_name,
            notification_whatsapp: toE164(v.whatsapp),
            ...(ref ? { affiliate_referral_code: ref.toUpperCase() } : {}),
            ...(contador_convite ? { accountant_business_invite_token: contador_convite } : {}),
          },
        },
      });
      if (error) return setError(translateAuthError(error.message));
      if (data.session) {
        const { error: setupError } = await supabase.rpc("ensure_user_setup");
        if (setupError) {
          console.error("Falha ao preparar a conta recém-criada:", setupError);
          return setError(
            "Sua conta foi criada, mas não foi possível concluir a configuração inicial. Entre novamente em instantes.",
          );
        }
        await navigate({ to: "/onboarding" });
        return;
      }
      setSentTo(v.email);
    } catch (error) {
      console.error("Falha ao criar conta:", error);
      setError(
        translateAuthError(
          error instanceof Error
            ? error.message
            : "Não foi possível conectar ao serviço de autenticação.",
        ),
      );
    }
  });

  if (sentTo) {
    return (
      <AuthShell title="Confirme seu e-mail">
        <div className="flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-foreground">
            <MailCheck className="h-7 w-7" />
          </span>
          <p className="mt-4 text-sm text-muted-foreground">
            Enviamos um link para <strong className="text-foreground">{sentTo}</strong>. Clique nele
            para ativar sua conta e começar seu teste grátis.
          </p>
          <Link to="/login" className="mt-6 text-sm font-medium text-primary hover:underline">
            Ir para o login
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Comece seus 14 dias grátis"
      subtitle="Passo 1 de 3 · Sem cartão de crédito."
      footer={
        <>
          Já tem conta?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <GoogleButton label="Cadastrar com Google" />
      <Divider />
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        {(
          [
            ["full_name", "Seu nome"],
            ["business_name", "Nome do negócio"],
            ["whatsapp", "WhatsApp para notificações"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <Label htmlFor={key}>{label}</Label>
            <Input
              id={key}
              type={key === "whatsapp" ? "tel" : "text"}
              maxLength={key === "whatsapp" ? 25 : 120}
              className="mt-1.5 h-11"
              {...register(key)}
            />
            <FieldError msg={formState.errors[key]?.message} />
          </div>
        ))}
        <div>
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            className="mt-1.5 h-11 rounded-xl"
            {...register("email")}
          />
          <FieldError msg={formState.errors.email?.message} />
        </div>
        <div>
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            className="mt-1.5 h-11 rounded-xl"
            {...register("password")}
          />
          <PasswordStrength value={pw} />
          <FieldError msg={formState.errors.password?.message} />
        </div>
        <div>
          <Label htmlFor="confirm">Confirmar senha</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            className="mt-1.5 h-11 rounded-xl"
            {...register("confirm")}
          />
          <FieldError msg={formState.errors.confirm?.message} />
        </div>
        {error && (
          <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="h-11 w-full rounded-xl" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Criando conta…" : "Testar Grátis por 14 Dias"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Ao criar a conta você aceita os{" "}
          <Link to="/termos" className="underline">
            Termos
          </Link>{" "}
          e a{" "}
          <Link to="/privacidade" className="underline">
            Política de Privacidade
          </Link>
          .
        </p>
      </form>
    </AuthShell>
  );
}
