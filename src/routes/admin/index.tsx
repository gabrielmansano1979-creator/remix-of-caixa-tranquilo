
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Download,
  LogOut,
  LoaderCircle,
  ShieldCheck,
  UserCheck,
  Wallet,
  Users,
  FileText,
  ExternalLink,
  Activity,
  Building2,
  CreditCard,
  ClipboardList,
  Clock3,
  UserPlus,
  AlertTriangle,
  TrendingUp,
  ReceiptText,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { exportReport } from "@/lib/reporting";
import { normalizeCpfCnpj } from "@/lib/identity";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Admin — Critical Cash" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type PartnerRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  status: string | null;
  created_at: string;
  tax_id: string | null;
  crc_number: string | null;
  pix_type: string | null;
  pix_key: string | null;
  coupon_code: string | null;
  commission_percent: number | null;
  referrals: number;
};

type PartnerApplicationDocument = {
  user_id: string;
  phone: string;
  city: string;
  state: string;
  office_name: string | null;
  crc_document_path: string;
  identity_document_path: string;
  address_document_path: string;
  submitted_at: string;
};

type CommissionRow = {
  id: string;
  partner_id: string;
  partner_name: string | null;
  amount: number;
  status: string;
  created_at: string;
};

type ClientRow = {
  user_id: string;
  partner_id: string;
  partner_name: string | null;
  client_name: string | null;
  client_email: string | null;
  subscription_status: string | null;
  created_at: string;
  paid_at: string | null;
};

type AdminOverview = {
  partners: PartnerRow[];
  commissions: CommissionRow[];
  clients: ClientRow[];
  total_commissions: number;
  total_commission_amount: number;
  total_clients: number;
};

type PlatformClient = {
  user_id: string;
  name: string;
  email: string | null;
  business_name: string | null;
  created_at: string | null;
  onboarding_done: boolean;
  trial_ends_at: string | null;
  subscription_status: string | null;
  plan: string | null;
  billing_interval: string | null;
  paid_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  entries_count: number;
};

type PlatformRequest = {
  id: string;
  user_id?: string | null;
  client_user_id?: string | null;
  name?: string | null;
  email?: string | null;
  client_name?: string | null;
  client_email?: string | null;
  accountant_name?: string | null;
  accountant_email?: string | null;
  company_name?: string | null;
  status: string | null;
  created_at?: string | null;
  requested_at?: string | null;
  decided_at?: string | null;
};

type PlatformAudit = {
  id: string;
  action: string;
  created_at: string;
  user_id: string | null;
  user_email: string | null;
};

type PlatformOverview = {
  generated_at: string;
  counts: Record<string, number>;
  clients: PlatformClient[];
  partner_requests: PlatformRequest[];
  accountant_requests: PlatformRequest[];
  recent_audit: PlatformAudit[];
};

type AuthStatus = "checking" | "authorized" | "error";

// Evita que a página administrativa fique carregando indefinidamente se a sessão
// ou o RPC de autorização não responderem.
function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, operation: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(operation + " não respondeu em " + Math.round(timeoutMs / 1000) + " segundos."));
    }, timeoutMs);

    Promise.resolve(promise).then(resolve, reject).finally(() => {
      window.clearTimeout(timeoutId);
    });
  });
}

const emptyOverview: AdminOverview = {
  partners: [],
  commissions: [],
  clients: [],
  total_commissions: 0,
  total_commission_amount: 0,
  total_clients: 0,
};

const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) || 0);

const date = (value: string | null | undefined) => {
  if (!value) return "—";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleDateString("pt-BR");
};

const dateTime = (value: string | null | undefined) => {
  if (!value) return "—";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

const statusLabel = (status: string | null | undefined) => {
  const labels: Record<string, string> = {
    pending: "Pendente",
    available: "Disponível",
    paid: "Paga",
    approved: "Aprovado",
    rejected: "Recusado",
    active: "Ativo",
    trialing: "Em teste",
    canceled: "Cancelado",
    past_due: "Pagamento atrasado",
    incomplete: "Incompleto",
    unpaid: "Não pago",
    expired: "Expirada",
    pending_approval: "Aguardando aprovação",
    revoked: "Revogado",
  };

  if (!status) return "Não informado";

  return labels[status] ?? status;
};

function AdminPage() {
  const queryClient = useQueryClient();

  const [busyKey, setBusyKey] = useState("");
  const [authStatus, setAuthStatus] =
    useState<AuthStatus>("checking");

  useEffect(() => {
    let active = true;

    const verifyAdminAccess = async () => {
      try {
        const {
          data: { user },
          error,
        } = await withTimeout(
          supabase.auth.getUser(),
          12_000,
          "A verificação da sessão",
        );

        if (!active) return;

        if (error || !user) {
          console.error("[ADMIN] Sessão ausente ou inválida:", error);
          window.location.replace("/login");
          return;
        }

        // Verificar somente o papel aqui. O RPC de dados é executado pela query
        // após a autorização, e um erro transitório não deve expulsar o admin.
        const { data: isAdmin, error: adminCheckError } = await withTimeout(
          supabase.rpc("has_role", {
            _user_id: user.id,
            _role: "admin",
          }),
          12_000,
          "A confirmação do acesso administrativo",
        );
        if (!active) return;
        if (adminCheckError) {
          console.error("[ADMIN] Falha ao verificar função administrativa:", adminCheckError);
          setAuthStatus("error");
          return;
        }
        if (isAdmin !== true) {
          window.location.replace("/caixa");
          return;
        }

        setAuthStatus("authorized");
      } catch (error) {
        if (!active) return;

        console.error(
          "[ADMIN] Erro ao verificar autenticação:",
          error,
        );

        // Falhas transitórias não devem provocar redirecionamentos em ciclo.
        // O painel continua bloqueado até uma nova verificação confirmar o acesso.
        setAuthStatus("error");
      }
    };

    void verifyAdminAccess();

    return () => {
      active = false;
    };
  }, []);

  const query = useQuery({
    queryKey: ["admin-partners"],
    enabled: authStatus === "authorized",
    queryFn: async (): Promise<AdminOverview> => {
      const { data, error } = await supabase.rpc(
        "admin_partner_overview",
      );

      if (error) {
        console.error(
          "[ADMIN] Erro ao carregar painel:",
          error,
        );

        throw error;
      }

      if (!data || typeof data !== "object") {
        throw new Error(
          "A função admin_partner_overview não retornou dados válidos.",
        );
      }

      const result = data as unknown as Partial<AdminOverview>;

      return {
        partners: Array.isArray(result.partners)
          ? result.partners
          : [],
        commissions: Array.isArray(result.commissions)
          ? result.commissions
          : [],
        clients: Array.isArray(result.clients)
          ? result.clients
          : [],
        total_commissions: Number(
          result.total_commissions ??
            result.commissions?.length ??
            0,
        ),
        total_commission_amount: Number(
          result.total_commission_amount ?? 0,
        ),
        total_clients: Number(result.total_clients ?? 0),
      };
    },
    refetchInterval: 60_000,
  });

  const data = query.data ?? emptyOverview;
  const partners = data.partners;
  const commissions = data.commissions;
  const clients = data.clients;

  const platformQuery = useQuery({
    queryKey: ["admin-platform-overview"],
    enabled: authStatus === "authorized",
    queryFn: async (): Promise<PlatformOverview> => {
      const { data, error } = await supabase.rpc("admin_platform_overview");
      if (error) throw error;
      if (!data || typeof data !== "object") {
        throw new Error("A função admin_platform_overview não retornou dados válidos.");
      }
      const result = data as unknown as Partial<PlatformOverview>;
      return {
        generated_at: String(result.generated_at ?? new Date().toISOString()),
        counts: result.counts && typeof result.counts === "object" ? result.counts : {},
        clients: Array.isArray(result.clients) ? result.clients : [],
        partner_requests: Array.isArray(result.partner_requests) ? result.partner_requests : [],
        accountant_requests: Array.isArray(result.accountant_requests) ? result.accountant_requests : [],
        recent_audit: Array.isArray(result.recent_audit) ? result.recent_audit : [],
      };
    },
    refetchInterval: 60_000,
  });
  const platform = platformQuery.data;
  const platformCounts = platform?.counts ?? {};
  const count = (key: string) => Number(platformCounts[key] ?? 0);
  const [clientSearch, setClientSearch] = useState("");
  const filteredPlatformClients = (platform?.clients ?? []).filter((client) => {
    const needle = clientSearch.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return true;
    return [client.name, client.email, client.business_name, client.subscription_status, client.plan]
      .some((value) => String(value ?? "").toLocaleLowerCase("pt-BR").includes(needle));
  });

  const documentsQuery = useQuery({
    queryKey: ["admin-partner-application-documents"],
    enabled: authStatus === "authorized",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_application_documents")
        .select("*")
        .order("submitted_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PartnerApplicationDocument[];
    },
  });

  const openApplicationDocument = async (path: string) => {
    // Open the tab synchronously from the admin's click so popup blockers do not
    // suppress the tab after the asynchronous authorization/signed-URL request.
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      toast.error("O navegador bloqueou a nova aba. Permita pop-ups para abrir o documento.");
      return;
    }
    tab.opener = null;
    try {
      const { data, error } = await supabase.storage
        .from("partner-application-documents")
        .createSignedUrl(path, 60);
      if (error) throw error;
      tab.location.href = data.signedUrl;
    } catch (error) {
      tab.close();
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o documento.");
    }
  };

  const pendingCommissions = commissions.filter(
    (item) =>
      item.status === "pending" ||
      item.status === "available",
  );

  const pendingAmount = pendingCommissions.reduce(
    (total, item) => total + Number(item.amount || 0),
    0,
  );

  const updatePartner = async (
    partnerId: string,
    action: "approved" | "rejected",
  ) => {
    const key = `${partnerId}:${action}`;
    setBusyKey(key);

    try {
      const { error } = await supabase.rpc(
        "admin_set_partner_status",
        {
          _partner_id: partnerId,
          _status: action,
        },
      );

      if (error) throw error;

      await queryClient.invalidateQueries({
        queryKey: ["admin-partners"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["admin-platform-overview"],
      });

      toast.success(
        action === "approved"
          ? "Contador aprovado."
          : "Solicitação recusada.",
      );
    } catch (error) {
      console.error(
        "[ADMIN] Erro ao atualizar parceiro:",
        error,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o cadastro.",
      );
    } finally {
      setBusyKey("");
    }
  };

  const exportAdmin = async () => {
    const rows = commissions.map((commission) => ({
      contador: commission.partner_name ?? "Não identificado",
      valor: money(Number(commission.amount)),
      status: statusLabel(commission.status),
      criada_em: date(commission.created_at),
    }));

    try {
      await exportReport({
        title: "Faturamento e comissões por contador",
        fileName: "faturamento-por-afiliado",
        format: "pdf",
        columns: [
          { key: "contador", label: "Contador" },
          { key: "valor", label: "Comissão" },
          { key: "status", label: "Status" },
          { key: "criada_em", label: "Criada em" },
        ],
        rows,
        summary: [
          ["Total de comissões", data.total_commissions],
          [
            "Valor total das comissões",
            money(data.total_commission_amount),
          ],
          ["Comissões pendentes", money(pendingAmount)],
          ["Contadores cadastrados", partners.length],
          ["Clientes indicados", data.total_clients],
        ],
      });
    } catch (error) {
      console.error("[ADMIN] Erro ao exportar relatório:", error);

      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o relatório.",
      );
    }
  };

  if (authStatus === "checking") {
    return (
      <div className="p-8 text-muted-foreground">
        Verificando acesso administrativo...
      </div>
    );
  }

  if (authStatus === "error") {
    return (
      <div className="p-8 text-muted-foreground">
        <p>Não foi possível confirmar a autorização administrativa. A verificação pode ter expirado por demora na rede ou no Supabase. O painel continua bloqueado até a permissão ser confirmada.</p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="p-8 text-muted-foreground">
        Carregando painel administrativo...
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="space-y-3 p-8">
        <p className="text-red-400">
          Não foi possível carregar os dados administrativos.
        </p>

        <p className="text-sm text-muted-foreground">
          Verifique o console do navegador e a função
          admin_partner_overview no Supabase.
        </p>

        <Button
          variant="outline"
          onClick={() => void query.refetch()}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
            Gestão global
          </p>

          <h1 className="mt-2 text-3xl font-bold text-white">
            Central de administração
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Visão global de clientes, assinaturas, solicitações, uso financeiro e atividade da plataforma.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void exportAdmin()}>
            <Download className="mr-2 h-4 w-4" />
            Exportar PDF
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const { error } = await supabase.auth.signOut();
              if (error) {
                toast.error("Não foi possível sair da conta. Tente novamente.");
                console.error("[ADMIN] Erro ao encerrar sessão:", error);
                return;
              }
              queryClient.clear();
              window.location.replace("/login");
            }}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>

      <AdminPixPayoutManagement enabled={authStatus === "authorized"} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Visão geral da plataforma</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Contagens globais calculadas no banco e listas operacionais recentes. Atualização automática a cada minuto.
            </p>
          </div>
          <Button variant="outline" size="sm" disabled={platformQuery.isFetching} onClick={() => void platformQuery.refetch()}>
            <RefreshCw className={`mr-2 h-4 w-4 ${platformQuery.isFetching ? "animate-spin" : ""}`} />
            Atualizar dados
          </Button>
        </div>
        {platformQuery.isError ? (
          <Card className="border-red-500/30 bg-red-950/20">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm text-red-300">Não foi possível carregar os indicadores globais. Verifique a migration admin_platform_overview no Supabase.</p>
              <Button variant="outline" onClick={() => void platformQuery.refetch()}>Tentar novamente</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={<Users className="h-4 w-4" />} label="Clientes cadastrados" value={String(count("registered_clients"))} />
              <Metric icon={<CheckCircle2 className="h-4 w-4" />} label="Assinantes ativos" value={String(count("subscribers_active"))} />
              <Metric icon={<Clock3 className="h-4 w-4" />} label="Em período de teste" value={String(count("subscribers_trialing"))} />
              <Metric icon={<AlertTriangle className="h-4 w-4" />} label="Pagamentos atrasados" value={String(count("subscribers_past_due"))} />
              <Metric icon={<UserPlus className="h-4 w-4" />} label="Novos clientes (7 dias)" value={String(count("new_clients_7d"))} />
              <Metric icon={<TrendingUp className="h-4 w-4" />} label="Novos clientes (30 dias)" value={String(count("new_clients_30d"))} />
              <Metric icon={<CheckCircle2 className="h-4 w-4" />} label="Onboarding concluído" value={String(count("onboarded_clients"))} />
              <Metric icon={<ClipboardList className="h-4 w-4" />} label="Onboarding pendente" value={String(count("onboarding_pending"))} />
              <Metric icon={<ClipboardList className="h-4 w-4" />} label="Solicitações de contador pendentes" value={String(count("partner_requests_pending"))} />
              <Metric icon={<Users className="h-4 w-4" />} label="Pedidos de acesso contábil pendentes" value={String(count("accountant_requests_pending"))} />
              <Metric icon={<CreditCard className="h-4 w-4" />} label="Assinaturas canceladas" value={String(count("subscribers_canceled"))} />
              <Metric icon={<CreditCard className="h-4 w-4" />} label="Assinaturas expiradas" value={String(count("subscribers_expired"))} />
              <Metric icon={<Clock3 className="h-4 w-4" />} label="Pix aguardando confirmação" value={String(count("subscribers_pending_pix"))} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="border-white/10 bg-zinc-900/60 text-zinc-100">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Uso e cadastros</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <MiniStat label="Contas de autenticação" value={count("auth_accounts")} />
                  <MiniStat label="Assinaturas registradas" value={count("subscriptions_total")} />
                  <MiniStat label="Cobrança mensal ativa" value={count("monthly_billing")} />
                  <MiniStat label="Cobrança anual ativa" value={count("annual_billing")} />
                  <MiniStat label="Lançamentos financeiros" value={count("entries_total")} />
                  <MiniStat label="Lançamentos em aberto" value={count("entries_pending")} />
                  <MiniStat label="Lançamentos pagos" value={count("entries_paid")} />
                  <MiniStat label="Solicitações contábeis totais" value={count("accountant_requests_total")} />
                  <MiniStat label="Eventos de auditoria (30 dias)" value={count("audit_events_30d")} />
                  <MiniStat label="Checkouts aguardando" value={count("checkout_pending")} />
                  <MiniStat label="Checkouts processados" value={count("checkout_processed")} />
                  <MiniStat label="Checkouts com falha" value={count("checkout_failed")} />
                  <MiniStat label="Eventos de pagamento com falha" value={count("payment_events_failed")} />
                  <MiniStat label="Notificações enviadas/registradas" value={count("reminder_logs_total")} />
                  <MiniStat label="Notificações com falha" value={count("reminder_logs_failed")} />
                  <MiniStat label="Regras de lembrete ativas" value={count("reminder_rules_active")} />
                </CardContent>
              </Card>
              <Card className="border-white/10 bg-zinc-900/60 text-zinc-100">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><ReceiptText className="h-5 w-5" />Volume financeiro registrado</CardTitle>
                  <p className="text-xs text-zinc-400">Valores somados dos lançamentos informados pelos clientes, não representam receita da Critical Cash.</p>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/10 p-4"><p className="text-sm text-zinc-400">Entradas registradas</p><p className="mt-2 text-xl font-semibold text-emerald-300">{money(count("income_cents") / 100)}</p></div>
                  <div className="rounded-xl border border-white/10 p-4"><p className="text-sm text-zinc-400">Saídas registradas</p><p className="mt-2 text-xl font-semibold text-rose-300">{money(count("expense_cents") / 100)}</p></div>
                  <div className="rounded-xl border border-white/10 p-4"><p className="text-sm text-zinc-400">Comissões registradas</p><p className="mt-2 text-xl font-semibold">{count("commissions_total")}</p></div>
                  <div className="rounded-xl border border-white/10 p-4"><p className="text-sm text-zinc-400">Comissões pagas / pendentes</p><p className="mt-2 text-xl font-semibold">{count("commissions_paid")} / {count("commissions_pending")}</p></div>
                  <div className="sm:col-span-2 rounded-xl border border-white/10 p-4"><p className="text-sm text-zinc-400">Valor registrado em comissões</p><p className="mt-2 text-xl font-semibold">{money(count("commission_amount_cents") / 100)}</p></div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-white/10 bg-zinc-900/60 text-zinc-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Gestão de clientes e assinaturas</CardTitle>
                <p className="text-sm text-zinc-400">Lista dos 200 cadastros mais recentes. Os indicadores acima consideram a base inteira.</p>
                <input
                  value={clientSearch}
                  onChange={(event) => setClientSearch(event.target.value)}
                  placeholder="Buscar por cliente, e-mail, empresa, plano ou status..."
                  aria-label="Buscar clientes da plataforma"
                  className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-primary"
                />
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] text-left text-sm">
                    <thead><tr className="border-b border-white/10 text-xs text-zinc-400">
                      {["Cliente / empresa", "E-mail", "Assinatura", "Plano / cobrança", "Cadastro", "Onboarding", "Período até", "Lançamentos"].map((title) => <th key={title} className="px-3 py-3 font-medium">{title}</th>)}
                    </tr></thead>
                    <tbody>
                      {filteredPlatformClients.length ? filteredPlatformClients.map((client) => (
                        <tr key={client.user_id} className="border-b border-white/5 last:border-0">
                          <td className="px-3 py-3"><p className="font-medium">{client.name || "Cliente"}</p><p className="text-xs text-zinc-400">{client.business_name || "Empresa não informada"}</p></td>
                          <td className="px-3 py-3">{client.email || "—"}</td>
                          <td className="px-3 py-3">{statusLabel(client.subscription_status)}{client.cancel_at_period_end ? <p className="text-xs text-amber-300">Cancelamento ao fim do período</p> : null}</td>
                          <td className="px-3 py-3">{client.plan || "—"}<p className="text-xs text-zinc-400">{client.billing_interval === "year" ? "Anual" : client.billing_interval === "month" ? "Mensal" : "Não informado"}</p></td>
                          <td className="px-3 py-3 whitespace-nowrap">{dateTime(client.created_at)}</td>
                          <td className="px-3 py-3">{client.onboarding_done ? "Concluído" : "Pendente"}</td>
                          <td className="px-3 py-3 whitespace-nowrap">{date(client.current_period_end || client.trial_ends_at)}</td>
                          <td className="px-3 py-3 text-right">{Number(client.entries_count) || 0}</td>
                        </tr>
                      )) : <EmptyRow colSpan={8} message="Nenhum cliente corresponde à busca." />}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="border-white/10 bg-zinc-900/60 text-zinc-100">
                <CardHeader><CardTitle>Solicitações de parceria contábil</CardTitle><p className="text-sm text-zinc-400">Total: {count("partner_requests_total")} · Pendentes: {count("partner_requests_pending")} · Aprovadas: {count("partner_requests_approved")} · Recusadas: {count("partner_requests_rejected")}</p></CardHeader>
                <CardContent><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-white/10 text-xs text-zinc-400">{["Nome", "E-mail", "Status", "Solicitada em"].map((title) => <th key={title} className="px-3 py-3 font-medium">{title}</th>)}</tr></thead><tbody>
                  {(platform?.partner_requests ?? []).length ? platform!.partner_requests.map((request) => <tr key={request.id} className="border-b border-white/5 last:border-0"><td className="px-3 py-3">{request.name || "—"}<p className="text-xs text-zinc-400">{request.company_name || ""}</p></td><td className="px-3 py-3">{request.email || "—"}</td><td className="px-3 py-3">{statusLabel(request.status)}</td><td className="px-3 py-3 whitespace-nowrap">{dateTime(request.created_at)}</td></tr>) : <EmptyRow colSpan={4} message="Nenhuma solicitação registrada." />}
                </tbody></table></div></CardContent>
              </Card>
              <Card className="border-white/10 bg-zinc-900/60 text-zinc-100">
                <CardHeader><CardTitle>Solicitações de acesso contábil</CardTitle><p className="text-sm text-zinc-400">Total: {count("accountant_requests_total")} · Pendentes: {count("accountant_requests_pending")} · Aprovadas: {count("accountant_requests_approved")} · Recusadas: {count("accountant_requests_rejected")}</p></CardHeader>
                <CardContent><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead><tr className="border-b border-white/10 text-xs text-zinc-400">{["Cliente", "Contador", "Status", "Solicitada em"].map((title) => <th key={title} className="px-3 py-3 font-medium">{title}</th>)}</tr></thead><tbody>
                  {(platform?.accountant_requests ?? []).length ? platform!.accountant_requests.map((request) => <tr key={request.id} className="border-b border-white/5 last:border-0"><td className="px-3 py-3">{request.client_name || "—"}<p className="text-xs text-zinc-400">{request.client_email || ""}</p></td><td className="px-3 py-3">{request.accountant_name || "—"}<p className="text-xs text-zinc-400">{request.accountant_email || ""}</p></td><td className="px-3 py-3">{statusLabel(request.status)}</td><td className="px-3 py-3 whitespace-nowrap">{dateTime(request.requested_at)}</td></tr>) : <EmptyRow colSpan={4} message="Nenhuma solicitação registrada." />}
                </tbody></table></div></CardContent>
              </Card>
            </div>

            <Card className="border-white/10 bg-zinc-900/60 text-zinc-100">
              <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5" />Atividade recente da plataforma</CardTitle><p className="text-sm text-zinc-400">Últimos 25 eventos de auditoria. Detalhes sensíveis não são exibidos nesta visão geral.</p></CardHeader>
              <CardContent><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b border-white/10 text-xs text-zinc-400">{["Evento", "Conta relacionada", "Data e hora"].map((title) => <th key={title} className="px-3 py-3 font-medium">{title}</th>)}</tr></thead><tbody>
                {(platform?.recent_audit ?? []).length ? platform!.recent_audit.map((event) => <tr key={event.id} className="border-b border-white/5 last:border-0"><td className="px-3 py-3">{event.action}</td><td className="px-3 py-3">{event.user_email || event.user_id || "Sistema"}</td><td className="px-3 py-3 whitespace-nowrap">{dateTime(event.created_at)}</td></tr>) : <EmptyRow colSpan={3} message="Nenhum evento de auditoria encontrado." />}
              </tbody></table></div></CardContent>
            </Card>
          </>
        )}
        {platform?.generated_at ? <p className="text-right text-xs text-zinc-500">Dados atualizados em {dateTime(platform.generated_at)} · Atualização automática a cada 60 segundos.</p> : null}
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          icon={<UserCheck className="h-4 w-4" />}
          label="Contadores cadastrados"
          value={String(partners.length)}
        />

        <Metric
          icon={<Wallet className="h-4 w-4" />}
          label="Total de comissões"
          value={String(data.total_commissions)}
        />

        <Metric
          icon={<Wallet className="h-4 w-4" />}
          label="Valor total das comissões"
          value={money(data.total_commission_amount)}
        />

        <Metric
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Comissões pendentes"
          value={money(pendingAmount)}
        />

        <Metric
          icon={<Users className="h-4 w-4" />}
          label="Clientes indicados"
          value={String(data.total_clients)}
        />
      </div>


      <Card>
        <CardHeader>
          <CardTitle>Documentação das solicitações</CardTitle>
          <p className="text-sm text-muted-foreground">Consulte os documentos privados enviados pelos candidatos antes de aprovar ou recusar a parceria.</p>
          <p className="text-xs leading-relaxed text-muted-foreground">A validação automática confere os dígitos do CPF/CNPJ e o formato informado do CRC. A situação cadastral e a regularidade profissional precisam ser confirmadas manualmente nos portais oficiais; o formulário não declara uma validação oficial automática.</p>
        </CardHeader>
        <CardContent>
          {documentsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando documentos...</p>
          ) : documentsQuery.isError ? (
            <div className="space-y-2 text-sm text-danger">
              <p>Não foi possível carregar os documentos dos candidatos.</p>
              <Button variant="outline" onClick={() => void documentsQuery.refetch()}>Tentar novamente</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead><tr className="border-b text-xs text-muted-foreground">
                  {["Candidato e credenciais", "Telefone", "Localidade", "Escritório", "Enviada em", "Documentos"].map((title) => <th key={title} className="px-3 py-3 font-medium">{title}</th>)}
                </tr></thead>
                <tbody>
                  {(documentsQuery.data ?? []).length ? documentsQuery.data!.map((item) => {
                    const partner = partners.find((row) => row.user_id === item.user_id);
                    return <tr key={item.user_id} className="border-b last:border-0">
                      <td className="px-3 py-3">
                        <p className="font-medium">{partner?.name ?? "Candidato"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">CPF/CNPJ: {partner?.tax_id ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">CRC: {partner?.crc_number ?? "—"}</p>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          {partner?.tax_id && normalizeCpfCnpj(partner.tax_id).length === 11 && <a className="text-primary underline" href="https://www.gov.br/pt-br/servicos/consultar-cadastro-de-pessoas-fisicas" target="_blank" rel="noreferrer">Consultar CPF na Receita</a>}
                          {partner?.tax_id && normalizeCpfCnpj(partner.tax_id).length === 14 && <a className="text-primary underline" href="https://www.gov.br/pt-br/servicos/consultar-cadastro-nacional-de-pessoas-juridicas" target="_blank" rel="noreferrer">Consultar CNPJ na Receita</a>}
                          {partner?.crc_number && <a className="text-primary underline" href="https://cfc.org.br/conselhos/" target="_blank" rel="noreferrer">Localizar CRC oficial</a>}
                        </div>
                      </td>
                      <td className="px-3 py-3">{item.phone}</td>
                      <td className="px-3 py-3">{item.city} / {item.state}</td>
                      <td className="px-3 py-3">{item.office_name ?? "—"}</td>
                      <td className="px-3 py-3">{dateTime(item.submitted_at)}</td>
                      <td className="px-3 py-3"><div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="outline" onClick={() => void openApplicationDocument(item.crc_document_path)}><FileText className="mr-1 h-3.5 w-3.5" />CRC</Button>
                        <Button size="sm" variant="outline" onClick={() => void openApplicationDocument(item.identity_document_path)}><ExternalLink className="mr-1 h-3.5 w-3.5" />Identidade</Button>
                        <Button size="sm" variant="outline" onClick={() => void openApplicationDocument(item.address_document_path)}><ExternalLink className="mr-1 h-3.5 w-3.5" />Endereço</Button>
                      </div></td>
                    </tr>;
                  }) : <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Nenhuma documentação recebida ainda.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-zinc-900/60 text-zinc-100">
        <CardHeader>
          <CardTitle>Gestão de contadores parceiros</CardTitle>
          <p className="text-sm text-zinc-400">
            Aprove ou recuse as solicitações. Os percentuais de comissão
            não podem ser alterados por este painel.
          </p>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-zinc-400">
                  {[
                    "Nome",
                    "E-mail",
                    "CPF/CNPJ e CRC",
                    "PIX para recebimento",
                    "Status",
                    "Solicitada em",
                    "Indicações pagantes",
                    "Ações",
                  ].map((title) => (
                    <th
                      key={title}
                      className="px-3 py-3 font-medium"
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {partners.length ? (
                  partners.map((partner) => (
                    <tr
                      key={partner.user_id}
                      className="border-b border-white/5 last:border-0"
                    >
                      <td className="px-3 py-3 font-medium">
                        {partner.name || "Nome não informado"}
                      </td>

                      <td className="px-3 py-3">
                        {partner.email ?? "—"}
                      </td>

                      <td className="px-3 py-3">
                        <div>{partner.tax_id ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">CRC: {partner.crc_number ?? "—"}</div>
                      </td>

                      <td className="px-3 py-3">
                        {partner.pix_type && partner.pix_key ? <><span className="font-medium">{partner.pix_type.toUpperCase()}</span><div className="break-all text-xs text-muted-foreground">{partner.pix_key}</div></> : "Ainda não informado"}
                      </td>

                      <td className="px-3 py-3">
                        {statusLabel(partner.status)}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        {dateTime(partner.created_at)}
                      </td>

                      <td className="num px-3 py-3">
                        {Number(partner.referrals) || 0}
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          {partner.status !== "approved" && (
                            <Button
                              size="sm"
                              disabled={!!busyKey}
                              onClick={() =>
                                void updatePartner(
                                  partner.user_id,
                                  "approved",
                                )
                              }
                            >
                              {busyKey ===
                                `${partner.user_id}:approved` && (
                                <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
                              )}
                              Aprovar
                            </Button>
                          )}

                          {partner.status !== "rejected" &&
                            partner.status !== "approved" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!!busyKey}
                                onClick={() =>
                                  void updatePartner(
                                    partner.user_id,
                                    "rejected",
                                  )
                                }
                              >
                                {busyKey ===
                                  `${partner.user_id}:rejected` && (
                                  <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
                                )}
                                Recusar
                              </Button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow
                    colSpan={8}
                    message="Nenhuma solicitação de contador encontrada."
                  />
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-zinc-900/60 text-zinc-100">
        <CardHeader>
          <CardTitle>Clientes indicados por contador</CardTitle>
          <p className="text-sm text-zinc-400">
            Clientes vinculados a uma indicação registrada nas assinaturas.
          </p>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-zinc-400">
                  {[
                    "Cliente",
                    "E-mail do cliente",
                    "Contador responsável",
                    "Status da assinatura",
                    "Cadastro",
                    "Pagamento",
                  ].map((title) => (
                    <th
                      key={title}
                      className="px-3 py-3 font-medium"
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {clients.length ? (
                  [...clients]
                    .sort((a, b) => {
                      const byCreatedAt =
                        new Date(b.created_at).getTime() -
                        new Date(a.created_at).getTime();
                      return byCreatedAt || b.user_id.localeCompare(a.user_id);
                    })
                    .map((client, index) => (
                    <tr
                      key={`${client.user_id}:${client.partner_id}:${index}`}
                      className="border-b border-white/5 last:border-0"
                    >
                      <td className="px-3 py-3 font-medium">
                        {client.client_name || "Nome não informado"}
                      </td>

                      <td className="px-3 py-3">
                        {client.client_email ?? "—"}
                      </td>

                      <td className="px-3 py-3">
                        {client.partner_name ||
                          "Contador não identificado"}
                      </td>

                      <td className="px-3 py-3">
                        {statusLabel(client.subscription_status)}
                      </td>

                      <td className="px-3 py-3">
                        {dateTime(client.created_at)}
                      </td>

                      <td className="px-3 py-3">
                        {date(client.paid_at)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow
                    colSpan={6}
                    message="Nenhum cliente com indicação registrada foi encontrado."
                  />
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-zinc-900/60 text-zinc-100">
        <CardHeader>
          <CardTitle>Histórico de comissões</CardTitle>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-zinc-400">
                  {[
                    "Contador",
                    "Valor",
                    "Status",
                    "Data de criação",
                  ].map((title) => (
                    <th
                      key={title}
                      className="px-3 py-3 font-medium"
                    >
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {commissions.length ? (
                  commissions.map((commission) => (
                    <tr
                      key={commission.id}
                      className="border-b border-white/5 last:border-0"
                    >
                      <td className="px-3 py-3 font-medium">
                        {commission.partner_name ||
                          "Contador não identificado"}
                      </td>

                      <td className="num px-3 py-3">
                        {money(Number(commission.amount))}
                      </td>

                      <td className="px-3 py-3">
                        {statusLabel(commission.status)}
                      </td>

                      <td className="px-3 py-3">
                        {dateTime(commission.created_at)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <EmptyRow
                    colSpan={4}
                    message="Nenhuma comissão registrada."
                  />
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


function AdminPixPayoutManagement({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const queue = useQuery({
    queryKey: ["admin-pix-payout-queue"],
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_pix_payout_queue");
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as Array<{
        partner_user_id: string; full_name: string | null; email: string | null;
        pix_type: string; pix_key: string; holder_name: string; pix_status: string;
        rejection_reason: string | null; updated_at: string;
      }>;
    },
    refetchInterval: 60_000,
  });
  const [busy, setBusy] = useState("");
  const review = async (partnerId: string, approve: boolean) => {
    setBusy(partnerId);
    try {
      const reason = approve ? null : "Chave ou titularidade precisa ser corrigida. Atualize os dados e solicite nova validação.";
      const { error } = await (supabase as any).rpc("admin_review_partner_pix", {
        _partner_user_id: partnerId, _approve: approve, _reason: reason,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["admin-pix-payout-queue"] });
      toast.success(approve ? "Chave Pix validada administrativamente." : "Chave Pix rejeitada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível revisar a chave Pix.");
    } finally {
      setBusy("");
    }
  };
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-white">Validação de chaves Pix de contadores</h2>
        <p className="mt-1 text-sm text-zinc-400">Confira titularidade antes de autorizar pagamentos. Aprovar aqui confirma apenas a revisão administrativa; não faz transferência.</p>
      </div>
      {queue.isError && <Card className="border-red-500/30 bg-red-950/20"><CardContent className="p-4 text-sm text-red-300">Não foi possível carregar as chaves Pix. Verifique a migration de recebimentos Pix.</CardContent></Card>}
      <Card className="border-white/10 bg-zinc-900/60 text-zinc-100">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead><tr className="border-b border-white/10 text-xs text-zinc-400">
                <th className="px-4 py-3">Contador</th><th className="px-4 py-3">Tipo / chave</th><th className="px-4 py-3">Titular declarado</th><th className="px-4 py-3">Situação</th><th className="px-4 py-3">Ações</th>
              </tr></thead>
              <tbody>
                {(queue.data ?? []).map((item) => <tr key={item.partner_user_id} className="border-b border-white/10 last:border-0">
                  <td className="px-4 py-3"><div className="font-medium">{item.full_name ?? "Contador"}</div><div className="text-xs text-zinc-400">{item.email ?? "—"}</div></td>
                  <td className="px-4 py-3"><div>{item.pix_type.toUpperCase()}</div><div className="break-all text-xs text-zinc-400">{item.pix_key}</div></td>
                  <td className="px-4 py-3">{item.holder_name}</td>
                  <td className="px-4 py-3">{({ pending: "Pendente", verified: "Validada", rejected: "Rejeitada" } as Record<string,string>)[item.pix_status] ?? item.pix_status}</td>
                  <td className="px-4 py-3"><div className="flex gap-2">
                    <Button size="sm" disabled={busy === item.partner_user_id || item.pix_status === "verified"} onClick={() => void review(item.partner_user_id,true)}>Validar</Button>
                    <Button size="sm" variant="outline" disabled={busy === item.partner_user_id || item.pix_status === "rejected"} onClick={() => void review(item.partner_user_id,false)}>Rejeitar</Button>
                  </div></td>
                </tr>)}
                {(!queue.data || queue.data.length === 0) && <tr><td colSpan={5} className="px-4 py-8 text-center text-zinc-400">{queue.isLoading ? "Carregando chaves Pix..." : "Nenhuma chave Pix cadastrada por contadores aprovados."}</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function EmptyRow({
  colSpan,
  message,
}: {
  colSpan: number;
  message: string;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="px-3 py-8 text-center text-zinc-400"
      >
        {message}
      </td>
    </tr>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/10 p-3">
      <p className="text-xs leading-relaxed text-zinc-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value.toLocaleString("pt-BR")}</p>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="border-white/10 bg-zinc-900/60 text-zinc-100">
      <CardHeader className="flex-row items-center gap-2 space-y-0 pb-2 text-zinc-400">
        <span>{icon}</span>
        <CardTitle className="text-sm font-medium">
          {label}
        </CardTitle>
      </CardHeader>

      <CardContent className="num text-2xl font-semibold text-white">
        {value}
      </CardContent>
    </Card>
  );
}
