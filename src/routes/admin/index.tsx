import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Download, LoaderCircle, ShieldCheck, UserCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { exportReport, type ReportFormat } from "@/lib/reporting";

export const Route = createFileRoute("/admin/")({
  beforeLoad: async () => {
    // 1. Verifica se há utilizador autenticado
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw redirect({ to: "/login" });
    }

    const userEmail = authData.user.email;
    const userRole = authData.user.user_metadata?.role;
    const isAdmin = userEmail === 'gabrielmansano1979@gmail.com' || userRole === 'admin';

    // Se não for admin, redireciona imediatamente para o caixa
    if (!isAdmin) {
      throw redirect({ to: "/caixa" });
    }
  },
  head: () => ({
    meta: [{ title: "Admin — Critical Cash" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminPage,
});

type PartnerRow = {
  user_id: string;
  name: string;
  tax_id: string;
  crc_number: string;
  email: string;
  pix_type: string;
  pix_key: string;
  status: string;
  coupon_code: string | null;
  commission_percent: number | null;
  referrals: number;
  gross_commission_cents: number;
};

type CommissionRow = {
  id: string;
  partner_id: string;
  partner_name: string;
  client_name: string | null;
  amount_cents: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  pix_type: string;
  pix_key: string;
};

type AdminOverview = { partners: PartnerRow[]; commissions: CommissionRow[] };

const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

function AdminPage() {
  const queryClient = useQueryClient();
  const [busyKey, setBusyKey] = useState("");

  const query = useQuery({
    queryKey: ["admin-partners"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_partner_overview");
      if (error) {
        // Retorna dados vazios caso a tabela/RPC ainda não tenha registos, evitando tela de erro 500
        return { partners: [], commissions: [] } as AdminOverview;
      }
      return data as unknown as AdminOverview;
    },
  });

  const data = query.data;
  const partners = data?.partners ?? [];
  const commissions = data?.commissions ?? [];
  const pendingCommissions = commissions.filter(
    (item) => item.status === "pending" || item.status === "available",
  );
  const pendingCents = pendingCommissions.reduce((total, item) => total + item.amount_cents, 0);
  const referralCount = partners.reduce((total, partner) => total + partner.referrals, 0);

  const updatePartner = async (partnerId: string, action: "approved" | "rejected" | number) => {
    const key = `${partnerId}:${action}`;
    setBusyKey(key);
    try {
      const result =
        typeof action === "number"
          ? await supabase.rpc("admin_update_partner_rate", {
              _partner_id: partnerId,
              _percent: action,
            })
          : await supabase.rpc("admin_set_partner_status", {
              _partner_id: partnerId,
              _status: action,
            });
      if (result.error) throw result.error;
      await queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
      toast.success(
        typeof action === "number"
          ? "Alíquota atualizada."
          : action === "approved"
            ? "Contador aprovado."
            : "Solicitação recusada.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível atualizar o cadastro.",
      );
    } finally {
      setBusyKey("");
    }
  };

  const markPaid = async (commission: CommissionRow) => {
    setBusyKey(commission.id);
    try {
      const { error } = await supabase.rpc("admin_mark_commission_paid", {
        _commission_id: commission.id,
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["admin-partners"] });
      toast.success("Comissão registrada como paga via PIX.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível atualizar o pagamento.",
      );
    } finally {
      setBusyKey("");
    }
  };

  const exportAdmin = async (format: ReportFormat) => {
    const rows = commissions.map((commission) => ({
      contador: commission.partner_name,
      cliente: commission.client_name ?? "Cliente",
      valor: money(commission.amount_cents),
      status: commission.status,
      criada_em: new Date(commission.created_at).toLocaleDateString("pt-BR"),
      paga_em: commission.paid_at ? new Date(commission.paid_at).toLocaleDateString("pt-BR") : "—",
      chave_pix: commission.pix_key,
    }));
    try {
      await exportReport({
        title: "Faturamento e comissões por contador",
        fileName: "faturamento-por-afiliado",
        format,
        columns: [
          { key: "contador", label: "Contador" },
          { key: "cliente", label: "Cliente" },
          { key: "valor", label: "Comissão" },
          { key: "status", label: "Status" },
          { key: "criada_em", label: "Criada em" },
          { key: "paga_em", label: "Paga em" },
          { key: "chave_pix", label: "Chave PIX" },
        ],
        rows,
        summary: [
          ["Comissões pendentes", money(pendingCents)],
          ["Contadores cadastrados", partners.length],
          ["Clientes indicados", referralCount],
        ],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o relatório.");
    }
  };

  if (query.isLoading)
    return <div className="p-8 text-muted-foreground">Carregando painel administrativo...</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-8 px-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">
            Gestão global
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white">Contadores e comissões</h1>
        </div>
        <div className="flex gap-2">
          {(["pdf", "excel", "csv"] as const).map((format) => (
            <Button key={format} variant="outline" onClick={() => void exportAdmin(format)}>
              <Download className="mr-2 h-4 w-4" />
              {format.toUpperCase()}
            </Button>
          ))}
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Metric
          icon={<UserCheck className="h-4 w-4" />}
          label="Contadores cadastrados"
          value={String(partners.length)}
        />
        <Metric
          icon={<Wallet className="h-4 w-4" />}
          label="Comissões pendentes"
          value={money(pendingCents)}
        />
        <Metric
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Clientes indicados"
          value={String(referralCount)}
        />
      </div>

      <Card className="bg-zinc-900/60 border-white/10 text-zinc-100">
        <CardHeader>
          <CardTitle>Gestão de contadores parceiros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-zinc-400">
                  {[
                    "Nome",
                    "CRC",
                    "E-mail",
                    "CPF/CNPJ",
                    "Chave PIX",
                    "Status",
                    "Indicações",
                    "Comissão",
                    "Ações",
                  ].map((title) => (
                    <th key={title} className="px-3 py-3 font-medium">
                      {title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {partners.length ? (
                  partners.map((partner) => (
                    <tr key={partner.user_id} className="border-b border-white/5 last:border-0">
                      <td className="px-3 py-3 font-medium">{partner.name}</td>
                      <td className="px-3 py-3">{partner.crc_number}</td>
                      <td className="px-3 py-3">{partner.email}</td>
                      <td className="px-3 py-3">{partner.tax_id}</td>
                      <td className="px-3 py-3">
                        {partner.pix_type}: {partner.pix_key}
                      </td>
                      <td className="px-3 py-3">{partner.status}</td>
                      <td className="num px-3 py-3">{partner.referrals}</td>
                      <td className="px-3 py-3">
                        <select
                          aria-label={`Comissão de ${partner.name}`}
                          className="h-9 rounded-lg border border-white/10 bg-zinc-950 px-2 text-zinc-100"
                          disabled={
                            !partner.coupon_code || busyKey.startsWith(`${partner.user_id}:`)
                          }
                          value={partner.commission_percent ?? 20}
                          onChange={(event) =>
                            updatePartner(partner.user_id, Number(event.target.value))
                          }
                        >
                          {Array.from({ length: 11 }, (_, index) => index + 20).map((value) => (
                            <option key={value} value={value}>
                              {value}%
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2">
                          {partner.status !== "approved" && (
                            <Button
                              size="sm"
                              disabled={!!busyKey}
                              onClick={() => updatePartner(partner.user_id, "approved")}
                            >
                              {busyKey === `${partner.user_id}:approved` && (
                                <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />
                              )}
                              Aprovar
                            </Button>
                          )}
                          {partner.status !== "rejected" && partner.status !== "approved" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!!busyKey}
                              onClick={() => updatePartner(partner.user_id, "rejected")}
                            >
                              Recusar
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-zinc-400">
                      Nenhum contador cadastrado.
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

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="bg-zinc-900/60 border-white/10 text-zinc-100">
      <CardHeader className="flex-row items-center gap-2 space-y-0 pb-2 text-zinc-400">
        <span>{icon}</span>
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent className="num text-2xl font-semibold text-white">{value}</CardContent>
    </Card>
  );
}