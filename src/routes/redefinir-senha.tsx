import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, FieldError, PasswordStrength, passwordScore, translateAuthError } from "@/components/auth-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({
    meta: [
      { title: "Nova senha — Critical Cash" },
      { name: "description", content: "Defina uma nova senha para sua conta." },
      { property: "og:title", content: "Nova senha — Critical Cash" },
      { property: "og:description", content: "Defina uma nova senha para sua conta." },
      { name: "robots", content: "noindex" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPage,
});

const schema = z
  .object({ password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres.").max(72), confirm: z.string() })
  .refine((d) => passwordScore(d.password) >= 2, { message: "Use letras maiúsculas, minúsculas e números.", path: ["password"] })
  .refine((d) => d.password === d.confirm, { message: "As senhas não conferem.", path: ["confirm"] });

function ResetPage() {
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState, watch } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setError(translateAuthError(error.message) + " O link pode ter expirado.");
    toast.success("Senha atualizada.");
    const profile = new URLSearchParams(window.location.search).get("perfil");
    window.location.replace(`/login?perfil=${profile === "contador" ? "contador" : "empresario"}`);
  });

  return (
    <AuthShell title="Criar nova senha">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div>
          <Label htmlFor="password">Nova senha</Label>
          <Input id="password" type="password" autoComplete="new-password" className="mt-1.5 h-11 rounded-xl" {...register("password")} />
          <PasswordStrength value={watch("password") ?? ""} />
          <FieldError msg={formState.errors.password?.message} />
        </div>
        <div>
          <Label htmlFor="confirm">Confirmar senha</Label>
          <Input id="confirm" type="password" autoComplete="new-password" className="mt-1.5 h-11 rounded-xl" {...register("confirm")} />
          <FieldError msg={formState.errors.confirm?.message} />
        </div>
        {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p>}
        <Button type="submit" className="h-11 w-full rounded-xl" disabled={formState.isSubmitting}>Salvar nova senha</Button>
      </form>
    </AuthShell>
  );
}
