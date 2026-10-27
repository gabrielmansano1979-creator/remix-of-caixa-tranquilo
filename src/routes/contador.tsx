import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, Building2, Download, FileText, LoaderCircle, Mail, MapPin, Phone, ShieldCheck, UserRound, Wallet, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { isValidCpfCnpj, isValidCrcNumber, normalizeCpfCnpj } from "@/lib/identity";
import { exportReport } from "@/lib/reporting";
import { AccountantClientManagement } from "@/components/accountant-client-management";
import { ACCOUNTANT_PLANS, formatPlanPrice } from "@/config/plans";
import { accessQuery } from "@/lib/app-data";
import { AccountantReferralProgram } from "@/components/accountant-referral-program";

export const Route = createFileRoute("/contador")({
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
  },
  head: () => ({
    meta: [{ title: "Painel do contador — Critical Cash" }, { name: "robots", content: "noindex" }],
  }),
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
  totals: {
    commission_cents: number;
    pending_cents: number;
    paid_cents: number;
    referred_clients: number;
    active_clients: number;
  };
  commissions: Array<{
    id: string;
    client_name: string | null;
    amount_cents: number;
    payment_amount_cents: number | null;
    commission_percent: number | null;
    status: string;
    created_at: string;
    paid_at: string | null;
  }>;
  referrals: Array<{
    user_id: string;
    client_name: string | null;
    plan: string;
    status: string;
    created_at: string;
    paid_at: string | null;
  }>;
  clients: Array<{
    client_name: string | null;
    plan: string;
    status: string;
    entry_count: number;
    income_cents: number;
    expense_cents: number;
    shared_at: string;
    entries: Array<{
      description: string;
      type: "income" | "expense";
      amount_cents: number;
      due_date: string;
      status: string;
      paid_at: string | null;
    }>;
  }>;
};

const empty = { full_name: "", tax_id: "", crc_number: "", phone: "", city: "", state: "", office_name: "" };
type ApplicationDocuments = { crc: File | null; identity: File | null; address: File | null };
const emptyDocuments: ApplicationDocuments = { crc: null, identity: null, address: null };
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_EXTENSIONS = [".pdf", ".csv", ".xls", ".xlsx"];
const DOCUMENT_MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".csv": "text/csv",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

const statusLabelPt = (status: string) => ({
  pending: "Pendente",
  available: "Disponível",
  paid: "Paga",
  active: "Ativa",
  trialing: "Em período de teste",
  canceled: "Cancelada",
  past_due: "Pagamento atrasado",
  incomplete: "Incompleta",
  unpaid: "Não paga",
}[status] ?? status);

const planLabelPt = (plan: string) => ({
  free: "Gratuito",
  starter: "Inicial",
  basic: "Básico",
  pro: "Profissional",
  premium: "Premium",
  business: "Empresarial",
}[plan.toLowerCase()] ?? plan);


function AccountantPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(empty);
  const [documents, setDocuments] = useState<ApplicationDocuments>(emptyDocuments);
  const [showApplicationForm, setShowApplicationForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ["partner-area"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_partner_status");
      if (error) throw error;
      const status = data as PartnerPageData;
      const { data: dashboard, error: dashboardError } =
        status.status === "approved"
          ? await supabase.rpc("partner_dashboard")
          : { data: null, error: null };
      if (dashboardError) throw dashboardError;
      return { status, dashboard: dashboard as PartnerDashboard | null };
    },
    refetchInterval: 15_000,
  });
  const access = useQuery(accessQuery);
  const state = query.data?.status;
  const dashboard = query.data?.dashboard;
  const clientRows = dashboard?.clients ?? [];
  useEffect(() => {
    if (state && state.status !== "none") {
      setForm({
        ...empty,
        full_name: state.full_name ?? "",
        tax_id: state.tax_id ?? "",
        crc_number: state.crc_number ?? "",
      });
    }
  }, [state]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.full_name.trim().length < 2) {
      toast.error("Informe seu nome para ativar a área do contador.");
      return;
    }
    const accountantCpf = normalizeCpfCnpj(form.tax_id);
    if (!/^\\d{11}$/.test(accountantCpf) || !isValidCpfCnpj(accountantCpf)) {
      toast.error("Informe um CPF válido do titular do cupom.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("register_accountant_access", {
        _full_name: form.full_name.trim(),
        _tax_id: accountantCpf,
      });
      if (error) throw error;
      setShowApplicationForm(false);
      await queryClient.invalidateQueries({ queryKey: ["partner-area"] });
      toast.success("Área do contador ativada. CPF vinculado para bloquear o uso do próprio cupom.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ativar a área do contador.");
    } finally {
      setBusy(false);
    }
  };

  if (query.isLoading) return <div className="p-8 text-muted-foreground">Carregando painel...</div>;
  if (query.isError)
    return (
      <div className="rounded-2xl border p-6 text-danger">
        Não foi possível carregar os dados do painel.{" "}
        <Button variant="outline" onClick={() => query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );

  const accountantCpfMissing = !state?.tax_id || !/^\\d{11}$/.test(normalizeCpfCnpj(state.tax_id));
  if (state?.status !== "approved" || accountantCpfMissing) {
    const canApply = true;
    return (
      <div className="mx-auto max-w-4xl space-y-6 py-8">
        <header className="space-y-3">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            <UserRound className="h-4 w-4" /> Auditoria contábil gratuita
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Auditoria Livre para Contadores</h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            Área gratuita para profissionais e empresas que desejam gerenciar clientes autorizados. Não é necessário comprovar registro no CRC, mas o CPF do titular é obrigatório para impedir o uso do próprio cupom em outra conta.
          </p>
        </header>
        {state?.status === "pending_approval" && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="flex gap-3 p-5">
              <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <h2 className="font-semibold">Solicitação em análise</h2>
                <p className="mt-1 text-sm text-muted-foreground">Seus dados e documentos foram enviados. O administrador avaliará a solicitação e registrará a aprovação ou a recusa.</p>
              </div>
            </CardContent>
          </Card>
        )}
        {state?.status === "rejected" && !showApplicationForm && (
          <Card className="border-danger/30 bg-danger/5">
            <CardContent className="flex gap-3 p-5">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
              <div><h2 className="font-semibold">Solicitação não aprovada</h2><p className="mt-1 text-sm text-muted-foreground">A avaliação anterior não foi aprovada. Confira os dados e documentos antes de enviar uma nova solicitação.</p></div>
            </CardContent>
          </Card>
        )}
        {canApply && !showApplicationForm && (
          <>
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Auditoria Livre — gratuita</CardTitle>
                <p className="text-sm text-muted-foreground">Ative a área do contador sem enviar documentos ou comprovar registro no CRC. Você só poderá consultar dados de empresas que autorizarem explicitamente o compartilhamento.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="grid gap-2 text-sm sm:grid-cols-2">
                  <li>✓ Conferência de lançamentos e comprovantes</li>
                  <li>✓ Histórico de alterações financeiras</li>
                  <li>✓ Relatórios por empresa autorizada</li>
                  <li>✓ Proteção contra uso do próprio cupom</li>
                </ul>
                <Button className="h-12 w-full rounded-xl text-base sm:w-auto" onClick={() => setShowApplicationForm(true)}>Solicitar acesso gratuito à Auditoria Livre <ArrowLeft className="ml-2 h-4 w-4 rotate-180" /></Button>
              </CardContent>
            </Card>
            <section className="space-y-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Planos para o caixa do escritório</h2>
                <p className="mt-1 text-sm text-muted-foreground">Os planos pagos são somente para quem deseja gerir o fluxo financeiro da própria empresa contábil. A auditoria de clientes autorizados permanece separada.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {ACCOUNTANT_PLANS.filter((plan) => plan.id !== "auditor_free").map((plan) => (
                  <Card key={plan.id} className={plan.popular ? "border-primary" : ""}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{plan.name}</CardTitle>
                      <p className="text-2xl font-bold">{formatPlanPrice(plan.priceMonthCents)}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
                      {plan.priceYearCents !== null && <p className="text-sm text-muted-foreground">{formatPlanPrice(plan.priceYearCents)}/ano</p>}
                    </CardHeader>
                    <CardContent><ul className="space-y-2 text-sm">{plan.features.map((feature) => <li key={feature} className="flex gap-2"><BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{feature}</span></li>)}</ul></CardContent>
                  </Card>
                ))}
              </div>
            </section>
            <Card>
              <CardHeader><CardTitle>Como funciona o acesso</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>1. Ative gratuitamente a área do contador.</p>
                <p>2. Convide clientes ou solicite acesso às empresas.</p>
                <p>3. Consulte somente os dados que cada empresa autorizar. O sistema impede o uso do próprio cupom de indicação.</p>
              </CardContent>
            </Card>
            <Button variant="outline" className="h-11 w-full rounded-xl text-base sm:w-auto" onClick={() => setShowApplicationForm(true)}>Solicitar Auditoria Livre <ArrowLeft className="ml-2 h-4 w-4 rotate-180" /></Button>
          </>
        )}
        {canApply && showApplicationForm && (
          <Card>
            <CardHeader>
              <Button type="button" variant="ghost" className="mb-1 w-fit px-0" onClick={() => setShowApplicationForm(false)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar</Button>
              <CardTitle>Ativar área do contador</CardTitle>
              <p className="text-sm text-muted-foreground">Não exigimos CRC, documentos profissionais ou comprovante de endereço. O CPF do titular é validado e vinculado ao cupom para bloquear o uso em uma conta de cliente do próprio contador.</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="partner-name">Nome ou nome do escritório</Label>
                  <Input id="partner-name" required minLength={2} maxLength={160} autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="partner-cpf">CPF do titular do cupom</Label>
                  <Input id="partner-cpf" required inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" maxLength={14} value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} />
                  <p className="text-xs text-muted-foreground">O CPF é validado pelos dígitos verificadores e comparado ao CPF informado no checkout de qualquer conta que usar seu cupom.</p>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2">A ativação é imediata. Nenhum dado financeiro de outra empresa será exibido sem autorização dela.</p>
                <Button type="submit" disabled={busy} className="h-12 rounded-xl sm:col-span-2">{busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{busy ? "Ativando..." : "Ativar área do contador gratuitamente"}</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const exportClients = async () => {
    try {
      await exportReport({
        title: "Relatório de clientes que autorizaram compartilhamento",
        fileName: "clientes-compartilhados",
        format: "pdf",
        columns: [
          { key: "cliente", label: "Cliente" },
          { key: "descricao", label: "Descrição" },
          { key: "tipo", label: "Tipo" },
          { key: "valor", label: "Valor" },
          { key: "vencimento", label: "Vencimento" },
          { key: "status", label: "Status" },
        ],
        rows: clientRows.flatMap((client) =>
          client.entries.map((entry) => ({
            cliente: client.client_name ?? "Cliente",
            descricao: entry.description,
            tipo: entry.type === "income" ? "Entrada" : "Saída",
            valor: money(entry.amount_cents),
            vencimento: new Date(`${entry.due_date}T12:00:00`).toLocaleDateString("pt-BR"),
            status: entry.status === "paid" ? "Pago" : "Pendente",
          })),
        ),
        summary: [
          ["Clientes autorizados", clientRows.length],
          [
            "Lançamentos incluídos",
            clientRows.reduce((count, client) => count + client.entry_count, 0),
          ],
        ],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o relatório.");
    }
  };
  return (
    <div className="mx-auto max-w-7xl space-y-6 py-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Auditoria Livre
        </p>
        <h1 className="mt-2 text-3xl font-bold">Painel do contador</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gerencie a Auditoria Livre e revise os dados financeiros das empresas que autorizaram o acesso.
        </p>
        <div className="mt-4">
          <Button asChild className="min-h-11 rounded-xl">
            <Link to="/notas-fiscais"><FileText className="mr-2 h-4 w-4" />Notas fiscais de serviço</Link>
          </Button>
        </div>
      </header>
      {access.data?.can_write && <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle>Fluxo de caixa da sua empresa</CardTitle>
          <p className="text-sm text-muted-foreground">
            Gerencie as finanças do seu próprio escritório em uma área separada dos dados dos clientes.
            Seus lançamentos, saldos e previsões pertencem somente à sua conta.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild className="min-h-11 rounded-xl">
            <Link to="/caixa">Abrir meu fluxo de caixa</Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 rounded-xl">
            <Link to="/contas">Gerenciar entradas e saídas</Link>
          </Button>
        </CardContent>
      </Card>}
      <AccountantPixPayoutSettings />
      {state.coupon && <AccountantReferralProgram coupon={state.coupon} totals={dashboard?.totals} commissions={dashboard?.commissions} />}
      <AccountantClientManagement />
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Clientes com acesso compartilhado</CardTitle>
          <ExportButtons onExport={exportClients} />
        </CardHeader>
        <CardContent>
          <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Somente leitura. Os dados aparecem apenas após autorização expressa do cliente.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  {[
                    "Cliente",
                    "Plano",
                    "Situação",
                    "Lançamentos",
                    "Receitas",
                    "Despesas",
                    "Acesso concedido",
                    "Relatório",
                  ].map((header) => (
                    <th key={header} className="px-3 py-3 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientRows.length ? (
                  clientRows.map((client, index) => (
                    <tr key={`${client.client_name}-${index}`} className="border-b last:border-0">
                      <td className="px-3 py-3 font-medium">{client.client_name ?? "Cliente"}</td>
                      <td className="px-3 py-3">{planLabelPt(client.plan)}</td>
                      <td className="px-3 py-3">{statusLabelPt(client.status)}</td>
                      <td className="num px-3 py-3">{client.entry_count}</td>
                      <td className="num px-3 py-3">{money(client.income_cents)}</td>
                      <td className="num px-3 py-3">{money(client.expense_cents)}</td>
                      <td className="px-3 py-3">
                        {new Date(client.shared_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-3 py-3">
                        <details>
                          <summary className="cursor-pointer text-primary">Ver relatório</summary>
                          <div className="absolute z-10 mt-2 max-h-72 max-w-[min(90vw,42rem)] overflow-auto rounded-xl border bg-card p-3 shadow-xl">
                            <DataTable
                              headers={["Descrição", "Tipo", "Valor", "Vencimento", "Status"]}
                              rows={client.entries.map((entry) => [
                                entry.description,
                                entry.type === "income" ? "Entrada" : "Saída",
                                money(entry.amount_cents),
                                new Date(`${entry.due_date}T12:00:00`).toLocaleDateString("pt-BR"),
                                entry.status === "paid" ? "Pago" : "Pendente",
                              ])}
                              empty="Nenhum lançamento disponível."
                            />
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      Nenhum cliente autorizou o compartilhamento ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


function AccountantPixPayoutSettings() {
  const queryClient = useQueryClient();
  const [pixType, setPixType] = useState("cpf");
  const [pixKey, setPixKey] = useState("");
  const [holderName, setHolderName] = useState("");
  const [saving, setSaving] = useState(false);
  const payoutQuery = useQuery({
    queryKey: ["my-pix-payout-status"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("my_pix_payout_status");
      if (error) throw error;
      return (data ?? {}) as {
        pix_type?: string; pix_key_masked?: string; holder_name?: string;
        status?: string; rejection_reason?: string | null; updated_at?: string;
      };
    },
  });
  useEffect(() => {
    const value = payoutQuery.data;
    if (value?.pix_type) setPixType(value.pix_type);
    if (value?.holder_name) setHolderName(value.holder_name);
  }, [payoutQuery.data]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pixKey.trim()) return toast.error("Informe a chave Pix para cadastrar ou atualizar.");
    if (holderName.trim().length < 2) return toast.error("Informe o nome completo do titular da chave.");
    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("save_my_pix_key", {
        _pix_type: pixType, _pix_key: pixKey.trim(), _holder_name: holderName.trim(),
      });
      if (error) throw error;
      setPixKey("");
      await queryClient.invalidateQueries({ queryKey: ["my-pix-payout-status"] });
      toast.success("Chave Pix enviada para validação administrativa. Nenhum pagamento foi realizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a chave Pix.");
    } finally {
      setSaving(false);
    }
  };
  const payoutStatus = payoutQuery.data?.status;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" />Recebimento de comissões por Pix</CardTitle>
        <p className="text-sm text-muted-foreground">Cadastre a chave e o titular para análise do administrador. A chave completa não é exibida novamente no painel; pagamentos continuam sujeitos a aprovação e registro do comprovante.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {payoutQuery.isError && <p className="text-sm text-destructive">Não foi possível consultar o cadastro Pix. Tente novamente.</p>}
        {payoutStatus && (
          <div className="rounded-lg border p-3 text-sm">
            <p><strong>Situação:</strong> {({ pending: "Em validação", verified: "Validada", rejected: "Rejeitada" } as Record<string,string>)[payoutStatus] ?? payoutStatus}</p>
            <p><strong>Chave cadastrada:</strong> {payoutQuery.data?.pix_key_masked ?? "—"}</p>
            <p><strong>Titular:</strong> {payoutQuery.data?.holder_name ?? "—"}</p>
            {payoutQuery.data?.rejection_reason && <p className="mt-1 text-destructive">Motivo: {payoutQuery.data.rejection_reason}</p>}
          </div>
        )}
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="accountant-pix-type">Tipo de chave Pix</Label>
            <select id="accountant-pix-type" value={pixType} onChange={(e) => setPixType(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="random">Chave aleatória</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="accountant-pix-key">Chave Pix</Label>
            <Input id="accountant-pix-key" value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder={payoutQuery.data?.pix_key_masked ? "Digite para substituir a chave cadastrada" : "Digite sua chave Pix"} autoComplete="off" required />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="accountant-pix-holder">Nome completo ou razão social do titular</Label>
            <Input id="accountant-pix-holder" value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Nome exatamente como consta na instituição financeira" required minLength={2} maxLength={160} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saving} className="min-h-11">
              {saving ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {saving ? "Enviando para validação..." : "Salvar chave Pix para validação"}
            </Button>
          </div>
        </form>
        <p className="text-xs leading-relaxed text-muted-foreground">A validação do formato não comprova, por si só, que a chave pertence ao titular informado. A equipe deve confirmar a titularidade antes de autorizar qualquer pagamento. Este cadastro não executa transferência automática.</p>
      </CardContent>
    </Card>
  );
}

function ExportButtons({ onExport }: { onExport: () => Promise<void> }) {
  return (
    <div className="flex gap-1">
      <Button variant="outline" size="sm" onClick={() => void onExport()}>
        <Download className="mr-1 h-3.5 w-3.5" />
        PDF
      </Button>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: unknown[][];
  empty: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[650px] text-left text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            {headers.map((header) => (
              <th key={header} className="px-3 py-3 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={index} className="border-b last:border-0">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="px-3 py-3">
                    {String(cell ?? "—")}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length} className="px-3 py-8 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
