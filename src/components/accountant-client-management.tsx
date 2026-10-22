import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, Clipboard, Download, FileText, History, ShieldCheck, Users, Eye, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { downloadFinancialDocument } from "@/lib/financial-documents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type AccountantPortal = {
  business_invite_token: string;
  authorized_clients: Array<{
    client_user_id: string;
    client_name: string;
    business_size: "MEI" | "ME" | "EPP" | "OUTRO" | null;
    granted_at: string;
    initial_balance_cents: number;
    balance_date: string | null;
    balance_updated_at: string | null;
    entries: Array<{ id: string; description: string; type: "income" | "expense"; amount_cents: number; due_date: string; status: string; paid_at: string | null; counterparty_name: string | null; created_at: string; receipt_path?: string | null; receipt_status?: "missing" | "pending" | "matched" | "mismatch"; receipt_amount_cents?: number | null; receipt_review_note?: string | null; receipt_reviewed_at?: string | null }>;
  }>;
  pending_requests: Array<{ id: string; client_name: string; requested_at: string }>;
  invited_companies: Array<{ client_name: string; accepted_at: string; access_granted: boolean }>;
  audit_logs: Array<{ id: string; client_user_id: string; client_name: string; actor_user_id?: string | null; action: "insert" | "update" | "delete"; entity_type: string; entity_id: string | null; details: { registered_company?: string; balance_before_cents?: number | string | null; balance_after_cents?: number | string | null; before?: Record<string, string | null> | null; after?: Record<string, string | null> | null }; created_at: string }>;
};

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const date = (value: string) => new Date(value).toLocaleDateString("pt-BR");
const dateTime = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const auditMoney = (value?: string | number | null) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? money(Number(value)) : "—";

export function AccountantClientManagement() {
  const [periodStart, setPeriodStart] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`);
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
  const [selectedAuditClient, setSelectedAuditClient] = useState("all");
  const [receiptViewer, setReceiptViewer] = useState<{ url: string; title: string; isPdf: boolean } | null>(null);
  const [receiptOpening, setReceiptOpening] = useState<string | null>(null);
  const openReceipt = async (entry: { id: string; description: string; receipt_path?: string | null }) => {
    if (!entry.receipt_path) { toast.error("Este lançamento ainda não tem comprovante."); return; }
    setReceiptOpening(entry.id);
    try {
      const { data: signed, error } = await supabase.storage.from("critical-cash-receipts").createSignedUrl(entry.receipt_path, 300);
      if (error) throw error;
      setReceiptViewer({ url: signed.signedUrl, title: entry.description || "Comprovante financeiro", isPdf: entry.receipt_path.toLowerCase().endsWith(".pdf") });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível abrir o comprovante."); }
    finally { setReceiptOpening(null); }
  };

  const query = useQuery({
    queryKey: ["accountant-client-management", periodStart, periodEnd],
    queryFn: async () => {
      const [portal, audit] = await Promise.all([
        supabase.rpc("my_accountant_portal_invites"),
        supabase.rpc("my_accountant_financial_audit", { _from: periodStart, _to: periodEnd }),
      ]);
      if (portal.error) throw portal.error;
      if (audit.error) throw audit.error;
      return { ...(portal.data as unknown as Omit<AccountantPortal, "audit_logs">), audit_logs: (audit.data ?? []) as AccountantPortal["audit_logs"] };
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

  if (query.isLoading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando clientes e convites...</CardContent></Card>;
  if (query.isError || !data) return <Card><CardContent className="space-y-3 p-6"><p className="text-sm text-danger">Não foi possível carregar os clientes e convites contábeis.</p><Button variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button></CardContent></Card>;
  const filteredAuditLogs = data.audit_logs.filter((item) => selectedAuditClient === "all" || item.client_user_id === selectedAuditClient);
  const auditSummaries = data.authorized_clients
    .filter((client) => selectedAuditClient === "all" || client.client_user_id === selectedAuditClient)
    .map((client) => {
      const entries = client.entries.slice();
      const net = (entry: typeof entries[number]) => (entry.type === "income" ? 1 : -1) * entry.amount_cents;
      const effectiveDate = (entry: typeof entries[number]) => (entry.paid_at ?? entry.due_date).slice(0, 10);
      const effectiveTime = (entry: typeof entries[number]) => entry.paid_at ? new Date(entry.paid_at).getTime() : new Date(`${entry.due_date}T12:00:00-03:00`).getTime();
      const snapshotDate = client.balance_date ?? periodStart;
      const startTime = new Date(`${periodStart}T00:00:00-03:00`).getTime();
      const snapshotTime = client.balance_updated_at ? new Date(client.balance_updated_at).getTime() : new Date(`${snapshotDate}T23:59:59-03:00`).getTime();
      const paid = entries.filter((entry) => entry.status === "paid");
      let opening = client.initial_balance_cents ?? 0;
      if (snapshotTime >= startTime) {
        opening -= paid.filter((entry) => effectiveTime(entry) >= startTime && effectiveTime(entry) <= snapshotTime).reduce((sum, entry) => sum + net(entry), 0);
      } else {
        opening += paid.filter((entry) => effectiveTime(entry) > snapshotTime && effectiveTime(entry) < startTime).reduce((sum, entry) => sum + net(entry), 0);
      }
      let actual = opening;
      let projected = opening;
      entries.filter((entry) => effectiveDate(entry) >= periodStart && effectiveDate(entry) <= periodEnd)
        .sort((a, b) => effectiveTime(a) - effectiveTime(b) || a.created_at.localeCompare(b.created_at))
        .forEach((entry) => { if (entry.status === "paid") actual += net(entry); projected += net(entry); });
      return { client_user_id: client.client_user_id, client_name: client.client_name, opening, closing: actual, projectedClosing: projected };
    });

  const downloadAccountantDocument = async (
    client: AccountantPortal["authorized_clients"][number],
    kind: "cash-flow" | "payables-receivables" | "expenses-goals" | "financial-complete" | "audit" | "closing-projection",
  ) => {
    const net = (entry: typeof client.entries[number]) => (entry.type === "income" ? 1 : -1) * entry.amount_cents;
    const effectiveDate = (entry: typeof client.entries[number]) => (entry.paid_at ?? entry.due_date).slice(0, 10);
    const effectiveTime = (entry: typeof client.entries[number]) => entry.paid_at ? new Date(entry.paid_at).getTime() : new Date(`${entry.due_date}T12:00:00-03:00`).getTime();
    const ordered = client.entries.filter((entry) => effectiveDate(entry) >= periodStart && effectiveDate(entry) <= periodEnd)
      .slice().sort((a, b) => effectiveTime(a) - effectiveTime(b) || a.created_at.localeCompare(b.created_at));
    const summary = auditSummaries.find((item) => item.client_user_id === client.client_user_id);
    let actual = summary?.opening ?? client.initial_balance_cents ?? 0;
    let projected = actual;
    const rows = ordered.map((entry) => {
      if (entry.status === "paid") actual += net(entry);
      projected += net(entry);
      return {
        date: date(entry.status === "paid" ? (entry.paid_at ?? entry.due_date).slice(0, 10) : entry.due_date),
        type: entry.type === "income" ? "Entrada" : "Saída",
        description: entry.description,
        payer: entry.type === "income" ? entry.counterparty_name || "Contraparte pendente no histórico" : client.client_name,
        beneficiary: entry.type === "expense" ? entry.counterparty_name || "Contraparte pendente no histórico" : client.client_name,
        counterparty: entry.counterparty_name || "Contraparte pendente no histórico",
        status: entry.status === "paid" ? "Pago" : "Pendente",
        amount: money(entry.amount_cents),
        income: entry.type === "income" ? money(entry.amount_cents) : "—",
        expense: entry.type === "expense" ? money(entry.amount_cents) : "—",
        actual_balance: money(actual),
        projected_balance: money(projected),
      };
    });
    const auditRows = data.audit_logs
      .filter((item) => item.client_user_id === client.client_user_id && item.created_at.slice(0, 10) >= periodStart && item.created_at.slice(0, 10) <= periodEnd)
      .map((item) => {
        const before = item.details.before ?? null;
        const after = item.details.after ?? null;
        return {
          timestamp: dateTime(item.created_at), company: item.details.registered_company || item.client_name,
          actor: item.actor_user_id || "Não identificado",
          action: item.action === "insert" ? "Inclusão" : item.action === "update" ? "Alteração" : "Exclusão",
          type_before: before?.type === "income" ? "Entrada" : before?.type === "expense" ? "Saída" : "—",
          type_after: after?.type === "income" ? "Entrada" : after?.type === "expense" ? "Saída" : "—",
          description_before: before?.description || "—", description_after: after?.description || "—",
          counterparty_before: before?.counterparty_name || "—", counterparty_after: after?.counterparty_name || "—",
          amount_before: auditMoney(before?.amount_cents), amount_after: auditMoney(after?.amount_cents),
          balance_before: auditMoney(item.details.balance_before_cents), balance_after: auditMoney(item.details.balance_after_cents),
          status_before: before?.status === "paid" ? "Pago" : before?.status === "pending" ? "Pendente" : "—",
          status_after: after?.status === "paid" ? "Pago" : after?.status === "pending" ? "Pendente" : "—",
          record_id: item.entity_id || "—",
        };
      });
    const expenses = ordered.filter((entry) => entry.type === "expense");
    const expenseGroups = new Map<string, number>();
    expenses.forEach((entry) => expenseGroups.set(entry.description, (expenseGroups.get(entry.description) ?? 0) + entry.amount_cents));
    const topExpense = [...expenseGroups.entries()].sort((a, b) => b[1] - a[1])[0];
    const baseSummary: Array<[string, string | number]> = [
      ["Saldo inicial do período", money(summary?.opening ?? client.initial_balance_cents ?? 0)],
      ["Saldo efetivo final", money(summary?.closing ?? actual)],
      ["Saldo projetado final", money(summary?.projectedClosing ?? projected)],
      ["Total de entradas no período", money(ordered.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + entry.amount_cents, 0))],
      ["Total de saídas no período", money(ordered.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amount_cents, 0))],
    ];
    const common = { companyName: client.client_name, periodStart, periodEnd };
    try {
      if (kind === "cash-flow") {
        await downloadFinancialDocument({ ...common, title: "01 — Relatório de Fluxo de Caixa", slug: "01-fluxo-de-caixa", columns: [
          { key: "date", label: "Data" }, { key: "description", label: "Movimentação" }, { key: "counterparty", label: "Contraparte" },
          { key: "status", label: "Situação" }, { key: "income", label: "Entrada" }, { key: "expense", label: "Saída" },
          { key: "actual_balance", label: "Saldo efetivo" }, { key: "projected_balance", label: "Saldo previsto" },
        ], rows, summary: baseSummary });
      } else if (kind === "payables-receivables") {
        await downloadFinancialDocument({ ...common, title: "02 — Relatório de Contas a Pagar e a Receber", slug: "02-contas-a-pagar-e-receber", columns: [
          { key: "date", label: "Vencimento / data" }, { key: "type", label: "Tipo" }, { key: "description", label: "Descrição" },
          { key: "counterparty", label: "Contraparte" }, { key: "status", label: "Situação" }, { key: "amount", label: "Valor" },
        ], rows, summary: [["Contas pendentes", String(ordered.filter((entry) => entry.status !== "paid").length)], ...baseSummary] });
      } else if (kind === "expenses-goals") {
        await downloadFinancialDocument({ ...common, title: "03 — Relatório de Despesas e Metas", slug: "03-despesas-e-metas", columns: [
          { key: "date", label: "Vencimento / data" }, { key: "description", label: "Descrição da despesa" },
          { key: "beneficiary", label: "Beneficiário" }, { key: "status", label: "Situação" }, { key: "amount", label: "Valor" },
        ], rows: rows.filter((row) => row.type === "Saída"), summary: [
          ["Total de despesas", money(expenses.reduce((sum, entry) => sum + entry.amount_cents, 0))],
          ["Maior destino identificado pela descrição", topExpense ? `${topExpense[0]} — ${money(topExpense[1])}` : "Nenhuma despesa no período"],
          ["Meta de faturamento", "Valor de meta não fornecido por esta consulta; não foi estimado."],
          ...baseSummary,
        ] });
      } else if (kind === "financial-complete") {
        await downloadFinancialDocument({ ...common, title: "04 — Relatório Financeiro Completo do Cliente", slug: "04-financeiro-completo", columns: [
          { key: "date", label: "Data" }, { key: "type", label: "Tipo" }, { key: "description", label: "Descrição" },
          { key: "payer", label: "Quem pagou" }, { key: "beneficiary", label: "Quem recebeu" },
          { key: "status", label: "Situação" }, { key: "amount", label: "Valor" },
          { key: "actual_balance", label: "Saldo efetivo após operação" }, { key: "projected_balance", label: "Saldo previsto" },
        ], rows, summary: baseSummary });
      } else if (kind === "audit") {
        await downloadFinancialDocument({ ...common, title: "05 — Relatório de Auditoria Financeira", slug: "05-auditoria-financeira", columns: [
          { key: "timestamp", label: "Data e hora" }, { key: "company", label: "Empresa" }, { key: "actor", label: "Responsável" },
          { key: "action", label: "Ação" }, { key: "type_before", label: "Tipo anterior" }, { key: "type_after", label: "Tipo posterior" },
          { key: "description_before", label: "Descrição anterior" }, { key: "description_after", label: "Descrição posterior" },
          { key: "counterparty_before", label: "Contraparte anterior" }, { key: "counterparty_after", label: "Contraparte posterior" },
          { key: "amount_before", label: "Valor anterior" }, { key: "amount_after", label: "Valor posterior" },
          { key: "balance_before", label: "Saldo antes" }, { key: "balance_after", label: "Saldo depois" },
          { key: "status_before", label: "Situação anterior" }, { key: "status_after", label: "Situação posterior" }, { key: "record_id", label: "ID do lançamento" },
        ], rows: auditRows, summary: [["Eventos encontrados", String(auditRows.length)]] });
      } else {
        await downloadFinancialDocument({ ...common, title: "06 — Demonstrativo de Fechamento e Projeção", slug: "06-fechamento-e-projecao", columns: [
          { key: "type", label: "Tipo" }, { key: "description", label: "Descrição" }, { key: "status", label: "Situação" },
          { key: "amount", label: "Valor" }, { key: "actual_balance", label: "Saldo efetivo" }, { key: "projected_balance", label: "Saldo projetado" },
        ], rows, summary: [...baseSummary, ["Observação", "O saldo efetivo considera operações pagas; a projeção considera também pendências."]] });
      }
      toast.success(`PDF gerado: ${client.client_name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    }
  };

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
            <label className="space-y-1 text-sm"><span className="font-medium">Data inicial do extrato e da auditoria</span><Input type="date" value={periodStart} max={periodEnd} onChange={(e) => setPeriodStart(e.target.value)} className="h-11 rounded-xl" /></label>
            <label className="space-y-1 text-sm"><span className="font-medium">Data final do extrato e da auditoria</span><Input type="date" value={periodEnd} min={periodStart} onChange={(e) => setPeriodEnd(e.target.value)} className="h-11 rounded-xl" /></label>
          </div>
          {data.authorized_clients.length ? <div className="space-y-4">{data.authorized_clients.map((client) => {
            const allEntries = client.entries.slice().sort((a, b) => a.due_date.localeCompare(b.due_date) || a.created_at.localeCompare(b.created_at));
            const effectiveDate = (entry: typeof allEntries[number]) => (entry.paid_at ?? entry.due_date).slice(0, 10);
            const effectiveTime = (entry: typeof allEntries[number]) => entry.paid_at ? new Date(entry.paid_at).getTime() : new Date(`${entry.due_date}T12:00:00-03:00`).getTime();
            const net = (entry: typeof allEntries[number]) => (entry.type === "income" ? 1 : -1) * entry.amount_cents;
            const paidEntries = allEntries.filter((entry) => entry.status === "paid");
            const snapshotDate = client.balance_date ?? periodStart;
            const periodStartTime = new Date(`${periodStart}T00:00:00-03:00`).getTime();
            const snapshotTime = client.balance_updated_at ? new Date(client.balance_updated_at).getTime() : new Date(`${snapshotDate}T23:59:59-03:00`).getTime();
            let opening = client.initial_balance_cents ?? 0;
            if (snapshotTime >= periodStartTime) {
              opening -= paidEntries.filter((entry) => effectiveTime(entry) >= periodStartTime && effectiveTime(entry) <= snapshotTime).reduce((sum, entry) => sum + net(entry), 0);
            } else {
              opening += paidEntries.filter((entry) => effectiveTime(entry) > snapshotTime && effectiveTime(entry) < periodStartTime).reduce((sum, entry) => sum + net(entry), 0);
            }
            let actual = opening;
            let projected = opening;
            const periodEntries = allEntries.filter((entry) => effectiveDate(entry) >= periodStart && effectiveDate(entry) <= periodEnd)
              .slice().sort((a, b) => effectiveTime(a) - effectiveTime(b) || a.created_at.localeCompare(b.created_at)).map((entry) => {
                if (entry.status === "paid") actual += net(entry);
                projected += net(entry);
                return { ...entry, actual_balance: actual, projected_balance: projected };
              });
            const closing = actual;
            const projectedClosing = projected;
            const income = periodEntries.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + entry.amount_cents, 0);
            const expense = periodEntries.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amount_cents, 0);
            return <div key={client.client_user_id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{client.client_name}</h3><p className="text-xs text-muted-foreground">Porte declarado: {client.business_size ?? "Não informado"} · Autorizado em {date(client.granted_at)} · {periodEntries.length} movimentações no período</p></div><span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600">Acesso autorizado</span></div><div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Entradas no período</p><p className="font-semibold">{money(income)}</p></div><div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Saídas no período</p><p className="font-semibold">{money(expense)}</p></div><div className="rounded-lg bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Saldo efetivo após pagamentos</p><p className="font-semibold">{money(closing)}</p><p className="mt-2 text-xs text-muted-foreground">Saldo previsto ao final do período</p><p className="font-semibold">{money(projectedClosing)}</p></div></div><div className="mt-4 rounded-xl border p-4"><h4 className="font-semibold">Documentos para download — {client.client_name}</h4><p className="mt-1 text-xs text-muted-foreground">Todos os PDFs usam o período selecionado acima. Os documentos 04, 05 e 06 são exclusivos do contador.</p><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><Button size="sm" variant="outline" onClick={() => void downloadAccountantDocument(client, "cash-flow")}><Download className="mr-2 h-4 w-4" />01 — Fluxo de Caixa</Button><Button size="sm" variant="outline" onClick={() => void downloadAccountantDocument(client, "payables-receivables")}><Download className="mr-2 h-4 w-4" />02 — Contas a Pagar/Receber</Button><Button size="sm" variant="outline" onClick={() => void downloadAccountantDocument(client, "expenses-goals")}><Download className="mr-2 h-4 w-4" />03 — Despesas e Metas</Button><Button size="sm" variant="outline" onClick={() => void downloadAccountantDocument(client, "financial-complete")}><Download className="mr-2 h-4 w-4" />04 — Financeiro Completo</Button><Button size="sm" variant="outline" onClick={() => void downloadAccountantDocument(client, "audit")}><Download className="mr-2 h-4 w-4" />05 — Auditoria Financeira</Button><Button size="sm" variant="outline" onClick={() => void downloadAccountantDocument(client, "closing-projection")}><Download className="mr-2 h-4 w-4" />06 — Fechamento e Projeção</Button></div></div><p className="mt-2 text-xs text-muted-foreground">Os relatórios incluem somente os lançamentos cadastrados e identificam despesas por descrição, não como classificação contábil oficial.</p><details className="mt-3" open><summary className="cursor-pointer text-sm font-medium text-primary">Extrato com saldo antes e depois de cada movimentação</summary><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="px-2 py-2">Data</th><th className="px-2 py-2">Descrição</th><th className="px-2 py-2">Pagador</th><th className="px-2 py-2">Beneficiário</th><th className="px-2 py-2">Situação</th><th className="px-2 py-2">Comprovante / conferência</th><th className="px-2 py-2 text-right">Entrada</th><th className="px-2 py-2 text-right">Saída</th><th className="px-2 py-2 text-right">Saldo efetivo após movimentação</th><th className="px-2 py-2 text-right">Saldo previsto</th></tr></thead><tbody><tr className="border-b bg-muted/30 font-medium"><td className="px-2 py-2" colSpan={7}>Saldo de abertura · antes da primeira movimentação</td><td className="px-2 py-2 text-right">{money(opening)}</td><td className="px-2 py-2 text-right">{money(opening)}</td></tr>{periodEntries.map((entry) => <tr key={client.client_user_id + entry.id} className="border-b last:border-0"><td className="whitespace-nowrap px-2 py-2">{date(entry.status === "paid" ? (entry.paid_at ?? entry.due_date).slice(0, 10) : entry.due_date)}</td><td className="px-2 py-2">{entry.description}</td><td className="px-2 py-2">{entry.type === "income" ? entry.counterparty_name || "—" : "—"}</td><td className="px-2 py-2">{entry.type === "expense" ? entry.counterparty_name || "—" : "—"}</td><td className="px-2 py-2">{entry.status === "paid" ? "Pago" : "Pendente · previsto"}</td><td className="px-2 py-2"><div className="flex min-w-44 flex-col items-start gap-1">{entry.receipt_status === "matched" ? <span className="text-xs font-medium text-emerald-700">● Compatível</span> : entry.receipt_status === "mismatch" ? <span className="text-xs font-medium text-amber-700">● Divergência</span> : entry.receipt_path ? <span className="text-xs font-medium text-amber-700">● Aguardando conferência</span> : <span className="text-xs font-medium text-red-700">● Sem comprovante</span>}{entry.receipt_path && <Button size="sm" variant="outline" className="h-8" disabled={receiptOpening === entry.id} onClick={() => void openReceipt(entry)}><Eye className="mr-1 h-3.5 w-3.5" />{receiptOpening === entry.id ? "Abrindo..." : "Visualizar"}</Button>}{entry.receipt_review_note && <span className="max-w-48 whitespace-normal text-xs text-muted-foreground">{entry.receipt_review_note}</span>}</div></td><td className="px-2 py-2 text-right">{entry.type === "income" ? money(entry.amount_cents) : "—"}</td><td className="px-2 py-2 text-right">{entry.type === "expense" ? money(entry.amount_cents) : "—"}</td><td className="px-2 py-2 text-right font-semibold">{money(entry.actual_balance)}</td><td className="px-2 py-2 text-right">{money(entry.projected_balance)}</td></tr>)}{!periodEntries.length && <tr><td className="px-2 py-5 text-center text-muted-foreground" colSpan={8}>Nenhuma movimentação neste período.</td></tr>}<tr className="bg-muted/30 font-semibold"><td className="px-2 py-2" colSpan={7}>Saldo final efetivo (após todas as movimentações pagas)</td><td className="px-2 py-2 text-right">{money(closing)}</td><td className="px-2 py-2 text-right">{money(projectedClosing)}</td></tr></tbody></table></div><p className="mt-2 text-xs text-muted-foreground">O saldo efetivo muda apenas com movimentações marcadas como pagas. O saldo previsto considera também as pendências; ambos partem do saldo informado pela empresa.</p></details></div>;
          })}</div> : <p className="text-sm text-muted-foreground">Nenhum cliente autorizou o acesso ainda.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Auditoria financeira privada</CardTitle></CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm"><span className="font-medium">Empresa do relatório de auditoria</span><select value={selectedAuditClient} onChange={(e) => setSelectedAuditClient(e.target.value)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm"><option value="all">Todas as empresas autorizadas</option>{data.authorized_clients.map((client) => <option key={client.client_user_id} value={client.client_user_id}>{client.client_name}</option>)}</select></label>
            <div className="flex items-end text-sm text-muted-foreground">Período: {date(periodStart)} a {date(periodEnd)}</div>
          </div>
          {auditSummaries.length > 0 && <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{auditSummaries.map((summary) => <div key={summary.client_user_id} className="rounded-xl border p-4"><p className="font-medium">{summary.client_name}</p><p className="mt-2 text-xs text-muted-foreground">Saldo antes do período</p><p className="font-semibold">{money(summary.opening)}</p><p className="mt-2 text-xs text-muted-foreground">Saldo final efetivo</p><p className="font-semibold">{money(summary.closing)}</p><p className="mt-2 text-xs text-muted-foreground">Saldo final previsto</p><p className="font-semibold">{money(summary.projectedClosing)}</p></div>)}</div>}
          <p className="mb-4 text-sm text-muted-foreground">Trilha de inclusão, alteração e exclusão das movimentações realizadas no período selecionado. Escolha uma empresa para consultar seu relatório individual; cada registro inclui pagador/beneficiário, valores e saldo antes/depois. O histórico só é retornado para empresas com autorização ativa deste contador.</p>
          {filteredAuditLogs.length ? <div className="overflow-x-auto"><table className="w-full min-w-[2050px] text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground">
            <th className="px-3 py-3">Data e hora</th><th className="px-3 py-3">Empresa do SaaS</th><th className="px-3 py-3">ID do responsável</th><th className="px-3 py-3">Ação</th><th className="px-3 py-3">Tipo anterior</th><th className="px-3 py-3">Tipo posterior</th><th className="px-3 py-3">Descrição anterior</th><th className="px-3 py-3">Descrição posterior</th><th className="px-3 py-3">Contraparte anterior</th><th className="px-3 py-3">Contraparte posterior</th><th className="px-3 py-3">Valor anterior</th><th className="px-3 py-3">Valor posterior</th><th className="px-3 py-3">Saldo antes da operação</th><th className="px-3 py-3">Saldo depois da operação</th><th className="px-3 py-3">Situação anterior</th><th className="px-3 py-3">Situação posterior</th><th className="px-3 py-3">ID do lançamento</th>
          </tr></thead><tbody>{filteredAuditLogs.map((item) => {
            const before = item.details.before ?? null;
            const after = item.details.after ?? null;
            const current = after ?? before ?? {};
            const type = current.type;
            const action = item.action === "insert" ? "Inclusão" : item.action === "update" ? "Alteração" : "Exclusão";
                        return <tr key={item.id} className="border-b align-top last:border-0">
              <td className="whitespace-nowrap px-3 py-3">{dateTime(item.created_at)}</td>
              <td className="px-3 py-3"><div className="font-medium">{item.details.registered_company || item.client_name}</div><div className="text-xs text-muted-foreground">{type === "income" ? "Empresa que recebe" : type === "expense" ? "Empresa que paga" : "Empresa proprietária"}</div></td>
              <td className="px-3 py-3 font-mono text-xs">{item.actor_user_id || "Não identificado"}</td>
              <td className="px-3 py-3">{action}</td>
              <td className="px-3 py-3">{before?.type === "income" ? "Entrada" : before?.type === "expense" ? "Saída" : "—"}</td>
              <td className="px-3 py-3">{after?.type === "income" ? "Entrada" : after?.type === "expense" ? "Saída" : "—"}</td>
              <td className="max-w-56 whitespace-normal px-3 py-3">{before?.description || "—"}</td>
              <td className="max-w-56 whitespace-normal px-3 py-3">{after?.description || "—"}</td>
              <td className="px-3 py-3">{before?.counterparty_name || "—"}</td>
              <td className="px-3 py-3">{after?.counterparty_name || "—"}</td>
              <td className="whitespace-nowrap px-3 py-3">{auditMoney(before?.amount_cents)}</td>
              <td className="whitespace-nowrap px-3 py-3">{auditMoney(after?.amount_cents)}</td>
              <td className="whitespace-nowrap px-3 py-3">{auditMoney(item.details.balance_before_cents)}</td>
              <td className="whitespace-nowrap px-3 py-3">{auditMoney(item.details.balance_after_cents)}</td>
              <td className="px-3 py-3">{before?.status === "paid" ? "Pago" : before?.status === "pending" ? "Pendente" : "—"}</td>
              <td className="px-3 py-3">{after?.status === "paid" ? "Pago" : after?.status === "pending" ? "Pendente" : "—"}</td>
              <td className="px-3 py-3 font-mono text-xs">{item.entity_id || "—"}</td>
            </tr>;
          })}</tbody></table></div> : <p className="text-sm text-muted-foreground">Nenhum evento de auditoria encontrado para a empresa e o período selecionados. Eventos novos serão registrados automaticamente após a migração ser aplicada.</p>}
        </CardContent>
      </Card>
    </section>
  );
}
