import { createFileRoute, Link } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, FieldError, translateAuthError } from "@/components/auth-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/esqueci-senha")({
  head: () => ({
    meta: [
      { title: "Recuperar senha — Critical Cash" },
      { name: "description", content: "Receba um link para redefinir sua senha." },
      { property: "og:title", content: "Recuperar senha — Critical Cash" },
      { property: "og:description", content: "Receba um link para redefinir sua senha." },
    ],
  }),
  component: ForgotPage,
});

const schema = z.object({ email: z.string().trim().email("Informe um e-mail válido.") });

function ForgotPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/redefinir-senha" });
    if (error) return setError(translateAuthError(error.message));
    setSent(true);
  });

  return (
    <AuthShell title="Esqueceu a senha?" subtitle="Enviaremos um link para você criar uma nova." footer={<Link to="/login" className="text-primary hover:underline">Voltar ao login</Link>}>
      {sent ? (
        <p className="rounded-xl bg-success/10 p-3 text-sm text-success" role="status">Se o e-mail estiver cadastrado, você receberá o link em instantes.</p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" autoComplete="email" className="mt-1.5 h-11 rounded-xl" {...register("email")} />
            <FieldError msg={formState.errors.email?.message} />
          </div>
          {error && <p className="rounded-xl bg-danger/10 p-3 text-sm text-danger" role="alert">{error}</p>}
          <Button type="submit" className="h-11 w-full rounded-xl" disabled={formState.isSubmitting}>Enviar link</Button>
        </form>
      )}
    </AuthShell>
  );
}
