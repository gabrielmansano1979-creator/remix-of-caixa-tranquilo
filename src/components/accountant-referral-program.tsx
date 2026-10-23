import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ReferralCommission = {
  id: string;
  client_name: string | null;
  amount_cents: number;
  payment_amount_cents: number | null;
  commission_percent: number | null;
  status: string;
};
type Props = {
  coupon: { code: string; discount_percent: number; commission_percent: number };
  totals?: { referred_clients: number; commission_cents: number; paid_cents: number };
  commissions?: ReferralCommission[];
};

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const statusLabel = (status: string) => ({ pending: "Pendente", available: "Disponível", paid: "Paga" }[status] ?? status);

export function AccountantReferralProgram({ coupon, totals, commissions = [] }: Props) {
  const payoutHistory = useQuery({
    queryKey: ["my-commission-payout-history"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("my_commission_payout_history");
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as Array<{
        id: string; amount_cents: number; status: string; requested_at: string;
        paid_at: string | null; external_transfer_reference: string | null;
      }>;
    },
  });
  const paidPayoutCents = (payoutHistory.data ?? [])
    .filter((item) => item.status === "paid")
    .reduce((sum, item) => sum + Number(item.amount_cents || 0), 0);
  const referralUrl = typeof window === "undefined" ? "" : window.location.origin + "/checkout?ref=" + encodeURIComponent(coupon.code);
  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle>Indique o Critical Cash</CardTitle>
        <p className="text-sm text-muted-foreground">Compartilhe seu link exclusivo. O cliente recebe 20% de desconto nos dois primeiros pagamentos mensais; do terceiro em diante, paga o valor normal. A comissão incide sobre o valor realmente pago.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="accountant-referral-link">Seu link de indicação</Label>
          <Input id="accountant-referral-link" readOnly value={referralUrl} onFocus={(event) => event.currentTarget.select()} />
          <p className="text-xs text-muted-foreground">Código: <strong>{coupon.code}</strong> · Desconto: 20%</p>
        </div>
        <p className="text-sm text-muted-foreground">Faixas de comissão para novas indicações: 1–5 clientes pagantes: 20%; 6–15: 25%; 16 ou mais: 30%. A taxa fica registrada por cliente no momento da indicação.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Clientes pagantes indicados</p><p className="mt-1 text-xl font-semibold">{Number(totals?.referred_clients ?? 0).toLocaleString("pt-BR")}</p></div>
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Comissões acumuladas</p><p className="mt-1 text-xl font-semibold">{money(Number(totals?.commission_cents ?? 0))}</p></div>
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Comissões pagas</p><p className="mt-1 text-xl font-semibold">{money(Number(totals?.paid_cents ?? 0) + paidPayoutCents)}</p></div>
        </div>
        <h3 className="font-semibold">Histórico de comissões</h3>
        <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm">
          <thead><tr className="border-b text-xs text-muted-foreground"><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Valor pago</th><th className="px-3 py-2">Taxa</th><th className="px-3 py-2">Comissão</th><th className="px-3 py-2">Situação</th></tr></thead>
          <tbody>
            {commissions.map((item) => <tr key={item.id} className="border-b last:border-0"><td className="px-3 py-2">{item.client_name ?? "Cliente"}</td><td className="px-3 py-2">{item.payment_amount_cents == null ? "—" : money(item.payment_amount_cents)}</td><td className="px-3 py-2">{item.commission_percent == null ? "—" : item.commission_percent + "%"}</td><td className="px-3 py-2">{money(item.amount_cents)}</td><td className="px-3 py-2">{statusLabel(item.status)}</td></tr>)}
            {commissions.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">As comissões aparecerão depois que os pagamentos indicados forem confirmados.</td></tr>}
          </tbody>
        </table></div>
        <h3 className="mt-5 font-semibold">Histórico de transferências Pix</h3>
        {payoutHistory.isError && <p className="text-sm text-red-500">Não foi possível carregar o histórico de pagamentos.</p>}
        <div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-sm">
          <thead><tr className="border-b text-xs text-muted-foreground"><th className="px-3 py-2">Solicitada em</th><th className="px-3 py-2">Valor</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Referência</th></tr></thead>
          <tbody>
            {(payoutHistory.data ?? []).map((item) => <tr key={item.id} className="border-b last:border-0"><td className="px-3 py-2">{new Date(item.requested_at).toLocaleDateString("pt-BR")}</td><td className="px-3 py-2">{money(Number(item.amount_cents))}</td><td className="px-3 py-2">{statusLabel(item.status)}</td><td className="px-3 py-2">{item.external_transfer_reference ?? "—"}</td></tr>)}
            {(!payoutHistory.data || payoutHistory.data.length === 0) && <tr><td colSpan={4} className="px-3 py-5 text-center text-muted-foreground">{payoutHistory.isLoading ? "Carregando histórico..." : "Nenhuma transferência registrada."}</td></tr>}
          </tbody>
        </table></div>
      </CardContent>
    </Card>
  );
}
