import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Clipboard, Download, FileText, History, ShieldCheck, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateAccountingReport } from "@/lib/reporting";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AccountantPortal = {
  business_invite_token: string;
  authorized_clients: Array<{
    client_user_id: string;
    client_name: string;
    business_size: "MEI" | "ME" | "EPP" | "OUTRO" | null;
    granted_at: string;
    initial_balance_cents: number;
    balance_date: string | null;
    entries: Array<{ id: string; description: string; type: "income" | "expense"; amount_cents: number; due_date: string; status: string; paid_at: string | null; counterparty_name: string | null; created_at: string }>;
  }>;
  pending_requests: Array<{ id: string; client_name: string; requested_at: string }>;
  invited_companies: Array<{ client_name: string; accepted_at: string; access_granted: boolean }>;
  audit_logs: Array<{ id: string; client_user_id: string; client_name: string; actor_user_id?: string | null; action: "insert" | "update" | "delete"; entity_type: string; entity_id: string | null; details: { registered_company?: string; before?: Record<string, string | null> | null; after?: Record<string, string | null> | null }; created_at: string }>;
};

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const date = (value: string) => new Date(value).toLocaleDateString("pt-BR");
const dateTime = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const auditMoney = (value?: string | null) => value && Number.isFinite(Number(value)) ? money(Number(value)) : "—";

export function AccountantClientManagement() {

  const query = useQuery({
    queryKey: ["accountant-client-management"],
    queryFn: async () => {
      const [portal, audit] = await Promise.all([
        supabase.rpc("my_accountant_portal_invites"),
        supabase.rpc("my_accountant_financial_audit"),
      ]);
      if (portal.error) throw portal.error;
      if (audit.error) throw audit.error;
      return { ...(portal.data as unknown as Omit<AccountantPortal, "audit_logs">), audit_logs: (audit.data ?? []) as AccountantPortal["audit_logs"] };
    },
  });
  const data = query.data;
  const [periodStart, setPeriodStart] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`);
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
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
  const downloadClientReport = async (client: AccountantPortal["authorized_clients"][number], period: "mensal" | "anual") => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const prefix = period === "anual" ? String(year) : `${year}-${String(month).padStart(2, "0")}`;
    const rows = client.entries
      .filter((entry) => entry.due_date.startsWith(prefix))
      .map((entry) => ({
        type: entry.type === "income" ? "Receita" : "Despesa",
        description: entry.description,
        amount_cents: entry.amount_cents,
        due_date: entry.due_date,
        status: entry.status === "paid" ? "Pago" : "Pendente",
      }));
    try {
      await generateAccountingReport({
        period,
        format: "pdf",
        channel: "download",
        companyName: client.client_name,
        businessSize: client.business_size,
        accountantOnly: true,
        accountantName: "",
        accountantWhatsapp: "",
        year,
        ...(period === "mensal" ? { month } : {}),
      }, rows);
      toast.success(`Relatório ${period} de ${client.client_name} gerado.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o relatório.");
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
          <div className="mb-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span className="font-medium">Data inicial das movimentações</span><Input type="date" value={periodStart} max={periodEnd} onChange={(e) => setPeriodStart(e.target.value)} className="h-11 rounded-xl" /></label>
            <label className="space-y-1 text-sm"><span className="font-medium">Data final das movimentações</span><Input type="date" value={periodEnd} min={periodStart} onChange={(e) => setPeriodEnd(e.target.value)} className="h-11 rounded-xl" /></label>
          </div>
          {data.authorized_clients.length ? <div className="space-y-4">{data.authorized_clients.map((client) => {
            const allEntries = client.entries.slice().sort((a, b) => a.due_date.localeCompare(b.due_date) || a.created_at.localeCompare(b.created_at));
            const effectiveDate = (entry: typeof allEntries[number]) => (entry.paid_at ?? entry.due_date).slice(0, 10);
            const net = (entry: typeof allEntries[number]) => (entry.type === "income" ? 1 : -1) * entry.amount_cents;
            const paidEntries = allEntries.filter((entry) => entry.status === "paid");
            const snapshotDate = client.balance_date ?? periodStart;
            let opening = client.initial_balance_cents ?? 0;
            if (snapshotDate >= periodStart) {
              opening -= paidEntries.filter((entry) => effectiveDate(entry) >= periodStart && effectiveDate(entry) <= snapshotDate).reduce((sum, entry) => sum + net(entry), 0);
            } else {
              opening += paidEntries.filter((entry) => effectiveDate(entry) > snapshotDate && effectiveDate(entry) < periodStart).reduce((sum, entry) => sum + net(entry), 0);
            }
            let actual = opening;
            let projected = opening;
            const periodEntries = allEntries.filter((entry) => entry.due_date >= periodStart && entry.due_date <= periodEnd).map((entry) => {
              if (entry.status === "paid") actual += net(entry);
              projected += net(entry);
              return { ...entry, actual_balance: actual, projected_balance: projected };
            });
            const closing = actual;
            const projectedClosing = projected;
            const income = periodEntries.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + entry.amount_cents, 0);
            const expense = periodEntries.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amount_cents, 0);
            return <div key={client.client_user_id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{client.client_name}</h3><p className="text-xs text-muted-foreground">Porte declarado: {client.business_size ?? "Não informado"} · Autorizado em {date(client.granted_at)} · {periodEntries.length} movimentações no período</p></div><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600">Acesso autorizado</span></div><div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Entradas no período</p><p className="font-semibold">{money(income)}</p></div><div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Saídas no período</p><p className="font-semibold">{money(expense)}</p></div><div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Saldo efetivo após pagamentos</p><p className="font-semibold">{money(closing)}</p><p className="mt-2 text-xs text-muted-foreground">Saldo previsto ao final do período</p><p className="font-semibold">{money(projectedClosing)}</p></div></div><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void downloadClientReport(client, "mensal")}><Download className="mr-2 h-4 w-4" />Baixar PDF do mês atual</Button><Button size="sm" variant="outline" onClick={() => void downloadClientReport(client, "anual")}><Download className="mr-2 h-4 w-4" />Baixar PDF do ano atual</Button></div><p className="mt-2 text-xs text-muted-foreground">Os relatórios incluem somente os lançamentos cadastrados e identificam despesas por descrição, não como classificação contábil oficial.</p><details className="mt-3" open><summary className="cursor-pointer text-sm font-medium text-primary">Extrato com saldo antes e depois de cada movimentação</summary><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="px-2 py-2">Data</th><th className="px-2 py-2">Descrição</th><th className="px-2 py-2">Pagador</th><th className="px-2 py-2">Beneficiário</th><th className="px-2 py-2">Situação</th><th className="px-2 py-2 text-right">Entrada</th><th className="px-2 py-2 text-right">Saída</th><th className="px-2 py-2 text-right">Saldo efetivo após movimentação</th><th className="px-2 py-2 text-right">Saldo previsto</th></tr></thead><tbody><tr className="border-b bg-muted/30 font-medium"><td className="px-2 py-2" colSpan={7}>Saldo de abertura · antes da primeira movimentação</td><td className="px-2 py-2 text-right">{money(opening)}</td><td className="px-2 py-2 text-right">{money(opening)}</td></tr>{periodEntries.map((entry) => <tr key={client.client_user_id + entry.id} className="border-b last:border-0"><td className="whitespace-nowrap px-2 py-2">{date(entry.due_date)}</td><td className="px-2 py-2">{entry.description}</td><td className="px-2 py-2">{entry.type === "income" ? entry.counterparty_name || "—" : "—"}</td><td className="px-2 py-2">{entry.type === "expense" ? entry.counterparty_name || "—" : "—"}</td><td className="px-2 py-2">{entry.status === "paid" ? "Pago" : "Pendente · previsto"}</td><td className="px-2 py-2 text-right">{entry.type === "income" ? money(entry.amount_cents) : "—"}</td><td className="px-2 py-2 text-right">{entry.type === "expense" ? money(entry.amount_cents) : "—"}</td><td className="px-2 py-2 text-right font-semibold">{money(entry.actual_balance)}</td><td className="px-2 py-2 text-right">{money(entry.projected_balance)}</td></tr>)}{!periodEntries.length && <tr><td className="px-2 py-5 text-center text-muted-foreground" colSpan={8}>Nenhuma movimentação neste período.</td></tr>}<tr className="bg-muted/30 font-semibold"><td className="px-2 py-2" colSpan={7}>Saldo final efetivo (após todas as movimentações pagas)</td><td className="px-2 py-2 text-right">{money(closing)}</td><td className="px-2 py-2 text-right">{money(projectedClosing)}</td></tr></tbody></table></div><p className="mt-2 text-xs text-muted-foreground">O saldo efetivo muda apenas com movimentações marcadas como pagas. O saldo previsto considera também as pendências; ambos partem do saldo informado pela empresa.</p></details></div>;
          })}</div> : <p className="text-sm text-muted-foreground">Nenhum cliente autorizou o acesso ainda.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Auditoria financeira privada</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">Trilha de inclusão, alteração e exclusão dos lançamentos das empresas que autorizaram seu acesso. O nome da empresa cadastrada no Critical Cash é exibido separadamente da contraparte. Até 500 eventos recentes.</p>
          {data.audit_logs.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1500px] text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground">
            <th className="px-3 py-3">Data e hora</th><th className="px-3 py-3">Empresa do SaaS</th><th className="px-3 py-3">ID do responsável</th><th className="px-3 py-3">Ação</th><th className="px-3 py-3">Tipo</th><th className="px-3 py-3">Descrição</th><th className="px-3 py-3">Pagador</th><th className="px-3 py-3">Beneficiário</th><th className="px-3 py-3">Valor anterior</th><th className="px-3 py-3">Valor posterior</th><th className="px-3 py-3">Situação anterior</th><th className="px-3 py-3">Situação posterior</th><th className="px-3 py-3">ID do lançamento</th>
          </tr></thead><tbody>{data.audit_logs.map((item) => {
            const before = item.details.before ?? null;
            const after = item.details.after ?? null;
            const current = after ?? before ?? {};
            const type = current.type;
            const action = item.action === "insert" ? "Inclusão" : item.action === "update" ? "Alteração" : "Exclusão";
            const payer = type === "income" ? current.counterparty_name : null;
            const beneficiary = type === "expense" ? current.counterparty_name : null;
            return <tr key={item.id} className="border-b align-top last:border-0">
              <td className="whitespace-nowrap px-3 py-3">{dateTime(item.created_at)}</td>
              <td className="px-3 py-3"><div className="font-medium">{item.details.registered_company || item.client_name}</div><div className="text-xs text-muted-foreground">{type === "income" ? "Empresa que recebe" : type === "expense" ? "Empresa que paga" : "Empresa proprietária"}</div></td>
              <td className="px-3 py-3 font-mono text-xs">{item.actor_user_id || "Não identificado"}</td>
              <td className="px-3 py-3">{action}</td>
              <td className="px-3 py-3">{type === "income" ? "Entrada" : type === "expense" ? "Saída" : "—"}</td>
              <td className="max-w-56 whitespace-normal px-3 py-3">{current.description || "—"}</td>
              <td className="px-3 py-3">{payer || "—"}</td>
              <td className="px-3 py-3">{beneficiary || "—"}</td>
              <td className="whitespace-nowrap px-3 py-3">{auditMoney(before?.amount_cents)}</td>
              <td className="whitespace-nowrap px-3 py-3">{auditMoney(after?.amount_cents)}</td>
              <td className="px-3 py-3">{before?.status === "paid" ? "Pago" : before?.status === "pending" ? "Pendente" : "—"}</td>
              <td className="px-3 py-3">{after?.status === "paid" ? "Pago" : after?.status === "pending" ? "Pendente" : "—"}</td>
              <td className="px-3 py-3 font-mono text-xs">{item.entity_id || "—"}</td>
            </tr>;
          })}</tbody></table></div> : <p className="text-sm text-muted-foreground">Nenhuma alteração financeira registrada para as empresas autorizadas. Novas inclusões, alterações e exclusões serão registradas automaticamente depois que a migração de auditoria estiver aplicada.</p>}
        </CardContent>
      </Card>
    </section>
  );
}
