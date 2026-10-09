import type { ReactNode } from "react";
import { useState } from "react";
import { Logo } from "@/components/brand";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
    </main>
  );
}

export function GoogleButton({ label = "Continuar com Google" }: { label?: string }) {
  const [isLoading, setIsLoading] = useState(false);

  const go = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/login` },
      });
      if (error) {
        toast.error(translateAuthError(error.message));
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Falha ao iniciar autenticação com Google:", error);
      toast.error(
        error instanceof Error
          ? `Não foi possível iniciar o acesso com Google: ${error.message}`
          : "Não foi possível iniciar o acesso com Google. Tente novamente.",
      );
      setIsLoading(false);
    }
  };
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full rounded-xl"
      onClick={go}
      disabled={isLoading}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6c-.3 1.4-1 2.5-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z"
          />
          <path
            fill="#34A853"
            d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8C3.9 20.5 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.7 14.1c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7.1H2.1C1.4 8.6 1 10.2 1 12s.4 3.4 1.1 4.9l3.6-2.8z"
          />
          <path
            fill="#EA4335"
            d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1C17.5 2.1 15 1 12 1 7.7 1 3.9 3.5 2.1 7.1l3.6 2.8C6.6 7.3 9.1 5.4 12 5.4z"
          />
        </svg>
      )}
      {label}
    </Button>
  );
}

export function Divider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      ou
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function passwordScore(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

export function PasswordStrength({ value }: { value: string }) {
  if (!value) return null;
  const s = passwordScore(value);
  const labels = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"];
  const color = s <= 1 ? "bg-danger" : s === 2 ? "bg-warning" : "bg-success";
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < s ? color : "bg-muted"}`} />
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Força da senha: {labels[s]}</p>
    </div>
  );
}

export function FieldError({ msg }: { msg?: string }) {
  return msg ? (
    <p className="mt-1 text-sm text-danger" role="alert">
      {msg}
    </p>
  ) : null;
}

export function translateAuthError(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed"))
    return "Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.";
  if (m.includes("already registered") || m.includes("already exists"))
    return "Este e-mail já está cadastrado. Faça login.";
  if (m.includes("weak") || m.includes("pwned"))
    return "Senha fraca ou vazada. Escolha outra senha.";
  if (m.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos.";
  if (m.includes("fetch") || m.includes("network") || m.includes("failed to connect")) {
    return "Não foi possível conectar ao serviço de autenticação. Verifique sua conexão e tente novamente.";
  }
  if (m.includes("redirect") || m.includes("provider is not enabled")) {
    return "O acesso solicitado não está habilitado. Verifique a configuração do provedor de autenticação.";
  }
  return "Não foi possível concluir a autenticação. Tente novamente.";
}
