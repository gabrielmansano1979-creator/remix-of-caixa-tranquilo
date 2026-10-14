
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
import { exportReport, type ReportFormat } from "@/lib/reporting";
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

type AuthStatus = "checking" | "authorized" | "error";

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
        } = await supabase.auth.getUser();

        if (!active) return;

        if (error || !user) {
          console.error("[ADMIN] Sessão ausente ou inválida:", error);
          window.location.replace("/login");
          return;
        }

        // Verificar somente o papel aqui. O RPC de dados é executado pela query
        // após a autorização, e um erro transitório não deve expulsar o admin.
        const { data: isAdmin, error: adminCheckError } = await supabase.rpc(
          "has_role",
          { _user_id: user.id, _role: "admin" },
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

        window.location.replace("/login");
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

  const documentsQuery = useQuery({
    queryKey: ["admin-partner-application-documents"],
    enabled: authStatus === "authorized",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_application_documents")
        .select("*")
        .order("submitted_at", { ascending: false });
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

  const exportAdmin = async (format: ReportFormat) => {
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
        format,
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
        <p>Não foi possível confirmar a autorização administrativa por uma falha temporária.</p>
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
            Contadores e comissões
          </h1>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["pdf", "excel", "csv"] as const).map((format) => (
            <Button
              key={format}
              variant="outline"
              onClick={() => void exportAdmin(format)}
            >
              <Download className="mr-2 h-4 w-4" />
              {format.toUpperCase()}
            </Button>
          ))}
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
                      <td className="px-3 py-3">{date(item.submitted_at)}</td>
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
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-zinc-400">
                  {[
                    "Nome",
                    "E-mail",
                    "CPF/CNPJ e CRC",
                    "PIX para recebimento",
                    "Status",
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
                    colSpan={7}
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
                  clients.map((client, index) => (
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
                        {date(client.created_at)}
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
                        {date(commission.created_at)}
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
