import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/login")({
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/login" });
    }
  },
  component: AdminLoginPage,
});

const ADMIN_SECRET = "criticalcash-admin";

function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        throw new Error("Sessão inválida.");
      }

      const { data: profile } = await supabase.from("profiles").select("is_admin").eq("user_id", userData.user.id).maybeSingle();
      if (profile?.is_admin !== true && password !== ADMIN_SECRET) {
        throw new Error("Credenciais inválidas para acesso administrativo.");
      }

      localStorage.setItem("critical_cash_admin", "enabled");
      toast.success("Login de administrador confirmado.");
      window.location.href = "/admin/repasses";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível entrar.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-500/10 text-violet-300">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <CardTitle>Login administrativo</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Senha de acesso</Label>
              <Input id="admin-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Informe a senha administrativa" />
            </div>
            <Button type="submit" className="w-full rounded-xl" disabled={loading}>
              {loading ? "Verificando..." : "Entrar no painel"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
