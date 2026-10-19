import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, Clipboard, ExternalLink, FileText, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AccountantPortal = {
  business_invite_token: string;
  authorized_clients: Array<{
    client_user_id: string;
    client_name: string;
    granted_at: string;
    entries: Array<{ description: string; type: "income" | "expense"; amount_cents: number; due_date: string; status: string; paid_at: string | null }>;
  }>;
  pending_requests: Array<{ id: string; client_name: string; requested_at: string }>;
  invited_companies: Array<{ client_name: string; accepted_at: string; access_granted: boolean }>;
};

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const date = (value: string) => new Date(value).toLocaleDateString("pt-BR");

export function AccountantClientManagement() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["accountant-client-management"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_accountant_portal_invites");
      if (error) throw error;
      return data as unknown as AccountantPortal;
    },
  });
  const data = query.data;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const companyInviteUrl = data?.business_invite_token
    ? `${origin}/cadastro?contador_convite=${encodeURIComponent(data.business_invite_token)}`
    : "";
  const copy = async (value: string, message: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(message);
    } catch {
      toast.error("Não foi possível copiar o link. Selecione e copie o endereço manualmente.");
    }
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ["accountant-client-management"] });
  const decide = async (id: string, approve: boolean) => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("decide_accountant_access", { _request_id: id, _approve: approve });
      if (error) throw error;
      await refresh();
      toast.success(approve ? "Acesso concedido ao contador." : "Solicitação recusada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a solicitação.");
    } finally {
      setBusy(false);
    }
  };

  if (query.isLoading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando clientes e convites...</CardContent></Card>;
  if (query.isError || !data) return <Card><CardContent className="space-y-3 p-6"><p className="text-sm text-danger">Não foi possível carregar os clientes e convites contábeis.</p><Button variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button></CardContent></Card>;

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-2xl font-semibold">Carteira contábil</h2>
        <p className="mt-1 text-sm text-muted-foreground">Convites para empresas e acesso aos documentos só depois da autorização expressa de cada cliente.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Convidar uma empresa</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Este link leva uma empresa ao cadastro do Critical Cash e registra que ela veio pelo seu convite. Ele não concede acesso aos dados financeiros.</p>
            <div className="break-all rounded-lg border bg-muted/30 p-3 text-xs">{companyInviteUrl}</div>
            <Button disabled={!companyInviteUrl} onClick={() => void copy(companyInviteUrl, "Link de convite para empresas copiado.")}><Clipboard className="mr-2 h-4 w-4" />Copiar link para empresas</Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Privacidade e autorização</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>O link de convite para empresas é separado do link que o cliente usa para convidar o contador.</p>
            <p>A empresa só aparece com dados financeiros após conceder autorização. Revogar a autorização encerra o acesso do contador.</p>
            <p>Os cálculos tributários não são executados por este painel nesta etapa; serão exclusivos da área contábil quando implementados com as regras e dados necessários.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Solicitações de acesso enviadas</CardTitle></CardHeader>
        <CardContent>
          {data.pending_requests.length ? <div className="space-y-3">{data.pending_requests.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><p className="font-medium">{item.client_name}</p><p className="text-xs text-muted-foreground">Solicitação enviada em {date(item.requested_at)}. Aguardando autorização do cliente.</p></div><span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-600">Pendente</span></div>)}</div> : <p className="text-sm text-muted-foreground">Nenhuma solicitação de acesso aguardando resposta.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Empresas que aceitaram seu convite</CardTitle></CardHeader>
        <CardContent>
          {data.invited_companies.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="px-3 py-3">Empresa</th><th className="px-3 py-3">Cadastro via convite</th><th className="px-3 py-3">Acesso financeiro</th></tr></thead><tbody>{data.invited_companies.map((item, index) => <tr key={item.client_name + item.accepted_at + index} className="border-b last:border-0"><td className="px-3 py-3 font-medium">{item.client_name}</td><td className="px-3 py-3">{date(item.accepted_at)}</td><td className="px-3 py-3">{item.access_granted ? "Autorizado" : "Ainda não autorizado"}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">Nenhuma empresa concluiu o cadastro pelo seu link ainda.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Clientes que autorizaram acesso</CardTitle></CardHeader>
        <CardContent>
          {data.authorized_clients.length ? <div className="space-y-4">{data.authorized_clients.map((client) => {
            const income = client.entries.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + entry.amount_cents, 0);
            const expense = client.entries.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amount_cents, 0);
            return <div key={client.client_user_id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{client.client_name}</h3><p className="text-xs text-muted-foreground">Autorizado em {date(client.granted_at)} · {client.entries.length} lançamentos</p></div><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600">Acesso autorizado</span></div><div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Entradas cadastradas</p><p className="font-semibold">{money(income)}</p></div><div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Saídas cadastradas</p><p className="font-semibold">{money(expense)}</p></div><div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Saldo líquido dos lançamentos</p><p className="font-semibold">{money(income - expense)}</p></div></div><details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-primary">Ver lançamentos financeiros</summary><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="px-2 py-2">Descrição</th><th className="px-2 py-2">Tipo</th><th className="px-2 py-2">Valor</th><th className="px-2 py-2">Data</th><th className="px-2 py-2">Situação</th></tr></thead><tbody>{client.entries.map((entry, i) => <tr key={client.client_user_id + entry.description + entry.due_date + i} className="border-b last:border-0"><td className="px-2 py-2">{entry.description}</td><td className="px-2 py-2">{entry.type === "income" ? "Entrada" : "Saída"}</td><td className="px-2 py-2">{money(entry.amount_cents)}</td><td className="px-2 py-2">{date(entry.due_date)}</td><td className="px-2 py-2">{entry.status === "paid" ? "Pago" : "Pendente"}</td></tr>)}</tbody></table></div></details></div>;
          })}</div> : <p className="text-sm text-muted-foreground">Nenhum cliente autorizou o acesso ainda.</p>}
        </CardContent>
      </Card>
    </section>
  );
}
