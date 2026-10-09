import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Clipboard, Download, LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { exportReport, formatPixKeyType, getPartnerAffiliateLinks, type ReportFormat } from "@/lib/reporting";

export const Route = createFileRoute("/contador")({
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Painel do contador — Critical Cash" }, { name: "robots", content: "noindex" }] }),
  component: AccountantPage,
});

type PartnerStatus = "none" | "pending_approval" | "approved" | "rejected";
type PartnerPageData = {
  status: PartnerStatus;
  full_name: string | null;
  tax_id: string | null;
  crc_number: string | null;
  pix_type: string | null;
  pix_key: string | null;
  coupon: { code: string; discount_percent: number; commission_percent: number } | null;
};
type PartnerDashboard = {
  totals: { commission_cents: number; pending_cents: number; paid_cents: number; referred_clients: number; active_clients: number };
  commissions: Array<{ id: string; client_name: string | null; amount_cents: number; status: string; created_at: string; paid_at: string | null }>;
  clients: Array<{
    client_name: string | null; plan: string; status: string; entry_count: number;
    income_cents: number; expense_cents: number; shared_at: string;
    entries: Array<{ description: string; type: "income" | "expense"; amount_cents: number; due_date: string; status: string; paid_at: string | null }>;
  }>;
};

const empty = { full_name: "", tax_id: "", crc_number: "", pix_type: "cpf", pix_key: "" };
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

function AccountantPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["partner-area"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_partner_status");
      if (error) throw error;
      const status = data as PartnerPageData;
      const { data: dashboard, error: dashboardError } = status.status === "approved"
        ? await supabase.rpc("partner_dashboard")
        : { data: null, error: null };
      if (dashboardError) throw dashboardError;
      return { status, dashboard: dashboard as PartnerDashboard | null };
    },
  });
  const state = query.data?.status;
  const dashboard = query.data?.dashboard;
  useEffect(() => {
    if (state && state.status !== "none") {
      setForm({
        full_name: state.full_name ?? "",
        tax_id: state.tax_id ?? "",
        crc_number: state.crc_number ?? "",
        pix_type: state.pix_type ?? "cpf",
        pix_key: state.pix_key ?? "",
      });
    }
  }, [state]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const taxId = form.tax_id.replace(/\D/g, "");
    if (taxId.length !== 11 && taxId.length !== 14) return toast.error("Informe um CPF ou CNPJ válido.");
    if (!/^[A-Z]{2}-\d{6}\/[A-Z]$/.test(form.crc_number.toUpperCase())) return toast.error("Informe o CRC no formato UF-123456/O.");
    setBusy(true);
    try {
      const { error } = await supabase.rpc("submit_partner_request", {
        _full_name: form.full_name.trim(),
        _tax_id: taxId,
        _crc_number: form.crc_number.trim().toUpperCase(),
        _pix_type: form.pix_type,
        _pix_key: form.pix_key.trim(),
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["partner-area"] });
      toast.success("Solicitação enviada para análise.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a solicitação.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); toast.success("Link copiado."); }
    catch { toast.error("Não foi possível copiar o link."); }
  };

  if (query.isLoading) return <div className="p-8 text-muted-foreground">Carregando painel...</div>;
  if (query.isError) return <div className="rounded-2xl border p-6 text-danger">Não foi possível carregar os dados do painel. <Button variant="outline" onClick={() => query.refetch()}>Tentar novamente</Button></div>;

  if (state?.status !== "approved") {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-8">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Programa de parceiros</p><h1 className="mt-2 text-3xl font-bold">Área do contador</h1></div>
        {state?.status === "pending_approval" && <div role="status" className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 text-sm text-amber-100">Sua solicitação está em análise. Você poderá acessar os links de indicação após a aprovação.</div>}
        {state?.status === "rejected" && <div role="alert" className="rounded-2xl border border-danger/20 bg-danger/5 p-5 text-sm text-danger">A solicitação anterior não foi aprovada. Revise os dados e envie novamente.</div>}
        {state?.status !== "pending_approval" && (
          <Card>
            <CardHeader><CardTitle>Solicitar parceria</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                <div><Label htmlFor="partner-name">Nome completo</Label><Input id="partner-name" required minLength={2} maxLength={160} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div><Label htmlFor="partner-doc">CPF ou CNPJ</Label><Input id="partner-doc" required value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} /></div>
                <div><Label htmlFor="partner-crc">CRC</Label><Input id="partner-crc" required placeholder="SP-123456/O" value={form.crc_number} onChange={(e) => setForm({ ...form, crc_number: e.target.value })} /></div>
                <div><Label htmlFor="partner-pix-type">Tipo de chave PIX</Label><select id="partner-pix-type" className="mt-1.5 h-10 w-full rounded-xl border bg-background px-3 text-sm" value={form.pix_type} onChange={(e) => setForm({ ...form, pix_type: e.target.value })}><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="random">Aleatória</option></select></div>
                <div className="sm:col-span-2"><Label htmlFor="partner-pix-key">Chave PIX para recebimento</Label><Input id="partner-pix-key" required maxLength={180} value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} /></div>
                <Button type="submit" disabled={busy} className="h-11 rounded-xl sm:col-span-2">{busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Enviar para análise</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const links = getPartnerAffiliateLinks(state.coupon?.code ?? "");
  const history = dashboard?.commissions ?? [];
  const clientRows = dashboard?.clients ?? [];
  const commissionRows = history.map((item) => ({
    cliente: item.client_name ?? "Cliente",
    valor: money(item.amount_cents),
    situacao: item.status,
    data: new Date(item.created_at).toLocaleDateString("pt-BR"),
    pago_em: item.paid_at ? new Date(item.paid_at).toLocaleDateString("pt-BR") : "—",
  }));
  const exportClients = async (format: ReportFormat) => {
    try {
      await exportReport({
        title: "Relatório de clientes que autorizaram compartilhamento",
        fileName: "clientes-compartilhados",
        format,
        columns: [
          { key: "cliente", label: "Cliente" }, { key: "descricao", label: "Descrição" }, { key: "tipo", label: "Tipo" },
          { key: "valor", label: "Valor" }, { key: "vencimento", label: "Vencimento" }, { key: "status", label: "Status" },
        ],
        rows: clientRows.flatMap((client) => client.entries.map((entry) => ({
          cliente: client.client_name ?? "Cliente",
          descricao: entry.description,
          tipo: entry.type === "income" ? "Entrada" : "Saída",
          valor: money(entry.amount_cents),
          vencimento: new Date(`${entry.due_date}T12:00:00`).toLocaleDateString("pt-BR"),
          status: entry.status === "paid" ? "Pago" : "Pendente",
        }))),
        summary: [["Clientes autorizados", clientRows.length], ["Lançamentos incluídos", clientRows.reduce((count, client) => count + client.entry_count, 0)]],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o relatório.");
    }
  };
  const exportCommissions = async (format: ReportFormat) => {
    try {
      await exportReport({
        title: "Extrato de comissões",
        fileName: "extrato-comissoes",
        format,
        columns: [
          { key: "cliente", label: "Cliente" }, { key: "valor", label: "Valor" }, { key: "situacao", label: "Situação" },
          { key: "data", label: "Data" }, { key: "pago_em", label: "Pago em" },
        ],
        rows: commissionRows,
        summary: [["Total acumulado", money(dashboard?.totals.commission_cents ?? 0)]],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o relatório.");
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-8">
      <header><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Parceiro contábil</p><h1 className="mt-2 text-3xl font-bold">Painel do contador</h1><p className="mt-2 text-sm text-muted-foreground">Acompanhe indicações, comissões e os clientes que autorizaram acesso aos seus relatórios.</p></header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Comissões acumuladas" value={money(dashboard?.totals.commission_cents ?? 0)} />
        <Metric label="Aguardando pagamento" value={money(dashboard?.totals.pending_cents ?? 0)} />
        <Metric label="Clientes indicados" value={String(dashboard?.totals.referred_clients ?? 0)} />
        <Metric label="Assinaturas ativas" value={String(dashboard?.totals.active_clients ?? 0)} />
      </div>
      <Card>
        <CardHeader><CardTitle>Links de indicação</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <LinkCard title="Landing page" value={links.home} onCopy={() => copy(links.home)} />
          <LinkCard title="Checkout com desconto de 10%" value={links.checkout} onCopy={() => copy(links.checkout)} />
          <p className="text-sm text-muted-foreground md:col-span-2">Cupom <strong className="text-foreground">{state.coupon?.code}</strong> · Comissão recorrente atual de {state.coupon?.commission_percent}%.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Clientes com acesso compartilhado</CardTitle><ExportButtons onExport={exportClients} /></CardHeader>
        <CardContent>
          <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 text-emerald-400" />Somente leitura. Os dados aparecem apenas após autorização expressa do cliente.</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
            <thead><tr className="border-b text-xs text-muted-foreground">{["Cliente", "Plano", "Situação", "Lançamentos", "Receitas", "Despesas", "Acesso concedido", "Relatório"].map((header) => <th key={header} className="px-3 py-3 font-medium">{header}</th>)}</tr></thead>
            <tbody>{clientRows.length ? clientRows.map((client, index) => <tr key={`${client.client_name}-${index}`} className="border-b last:border-0">
              <td className="px-3 py-3 font-medium">{client.client_name ?? "Cliente"}</td><td className="px-3 py-3">{client.plan}</td><td className="px-3 py-3">{client.status}</td>
              <td className="num px-3 py-3">{client.entry_count}</td><td className="num px-3 py-3">{money(client.income_cents)}</td><td className="num px-3 py-3">{money(client.expense_cents)}</td>
              <td className="px-3 py-3">{new Date(client.shared_at).toLocaleDateString("pt-BR")}</td>
              <td className="px-3 py-3"><details><summary className="cursor-pointer text-primary">Ver relatório</summary><div className="absolute z-10 mt-2 max-h-72 max-w-[min(90vw,42rem)] overflow-auto rounded-xl border bg-card p-3 shadow-xl"><DataTable headers={["Descrição", "Tipo", "Valor", "Vencimento", "Status"]} rows={client.entries.map((entry) => [entry.description, entry.type === "income" ? "Entrada" : "Saída", money(entry.amount_cents), new Date(`${entry.due_date}T12:00:00`).toLocaleDateString("pt-BR"), entry.status === "paid" ? "Pago" : "Pendente"])} empty="Nenhum lançamento disponível." /></div></details></td>
            </tr>) : <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Nenhum cliente autorizou o compartilhamento ainda.</td></tr>}</tbody>
          </table></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Histórico de comissões e saques via PIX</CardTitle><ExportButtons onExport={exportCommissions} /></CardHeader>
        <CardContent><DataTable headers={["Cliente", "Comissão", "Status", "Criada em", "Paga em"]} rows={commissionRows.map((row) => Object.values(row))} empty="Nenhuma comissão registrada." /></CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Chave PIX cadastrada: {formatPixKeyType(state.pix_type ?? "")} · {state.pix_key}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <Card><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader><CardContent className="num text-2xl font-semibold">{value}</CardContent></Card>;
}

function LinkCard({ title, value, onCopy }: { title: string; value: string; onCopy: () => void }) {
  return <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/30 p-4"><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{title}</p><p className="truncate text-sm">{value}</p></div><Button variant="outline" size="icon" aria-label={`Copiar ${title}`} onClick={onCopy}><Clipboard className="h-4 w-4" /></Button></div>;
}

function ExportButtons({ onExport }: { onExport: (format: ReportFormat) => Promise<void> }) {
  return <div className="flex gap-1">{(["pdf", "excel", "csv"] as const).map((format) => <Button key={format} variant="outline" size="sm" onClick={() => void onExport(format)}><Download className="mr-1 h-3.5 w-3.5" />{format.toUpperCase()}</Button>)}</div>;
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: unknown[][]; empty: string }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground">{headers.map((header) => <th key={header} className="px-3 py-3 font-medium">{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index} className="border-b last:border-0">{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3">{String(cell ?? "—")}</td>)}</tr>) : <tr><td colSpan={headers.length} className="px-3 py-8 text-center text-muted-foreground">{empty}</td></tr>}</tbody></table></div>;
}
