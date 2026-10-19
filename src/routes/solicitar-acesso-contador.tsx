import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/solicitar-acesso-contador")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  head: () => ({ meta: [{ title: "Solicitação de acesso contábil — Critical Cash" }, { name: "robots", content: "noindex" }] }),
  component: AccountantAccessRequestPage,
});

function AccountantAccessRequestPage() {
  const { token } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [checked, setChecked] = useState(false);

  const checkSession = async () => {
    const { data, error } = await supabase.auth.getUser();
    setSignedIn(!error && !!data.user);
    setChecked(true);
    return !error && !!data.user;
  };

  const submit = async () => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
      toast.error("Este link de convite é inválido ou está incompleto.");
      return;
    }
    setBusy(true);
    try {
      const ok = await checkSession();
      if (!ok) return;
      const { error } = await supabase.rpc("request_accountant_access", { _token: token });
      if (error) throw error;
      setSubmitted(true);
      toast.success("Solicitação enviada ao cliente para aprovação.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a solicitação.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-5 py-10">
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <div className="mb-2 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-6 w-6" /></div>
          <CardTitle className="text-2xl">Solicitar acesso contábil</CardTitle>
          <p className="text-sm text-muted-foreground">Este convite permite pedir autorização para consultar os documentos financeiros da empresa. Ele não libera dados automaticamente.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {submitted ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm">
              Solicitação enviada. O cliente verá a mensagem na área de compartilhamento do Critical Cash e poderá aprovar ou recusar. Os dados só ficam disponíveis após a aprovação.
            </div>
          ) : (
            <>
              <p className="text-sm">Ao continuar, você enviará uma solicitação identificada pelo seu cadastro profissional. O cliente precisará confirmar expressamente o acesso.</p>
              <Button className="w-full" disabled={busy || !token} onClick={() => void submit()}>{busy ? "Enviando solicitação..." : "Enviar pedido de autorização ao cliente"}</Button>
              {checked && signedIn === false && <p className="text-sm text-amber-600">Entre na sua conta de contador e abra este mesmo link novamente para enviar a solicitação.</p>}
              <p className="text-xs text-muted-foreground">Se ainda não estiver autenticado, entre primeiro e depois reabra o link. Nenhum acesso é concedido apenas por abrir a página.</p>
            </>
          )}
          <Button variant="outline" className="w-full" asChild><Link to="/login">Ir para o login</Link></Button>
        </CardContent>
      </Card>
    </main>
  );
}
