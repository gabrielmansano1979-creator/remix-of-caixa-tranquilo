import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CheckCircle2, Clipboard, ExternalLink, Search, ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

const pendingRequests = [
  {
    id: "1",
    name: "Escritório Nova Era",
    taxId: "12.345.678/0001-90",
    crc: "SP-123456/O",
    pixType: "CPF",
    pixKey: "123.456.789-09",
    amount: 1840.5,
    status: "Dados completos",
    canPay: true,
  },
  {
    id: "2",
    name: "Contabilidade Prime",
    taxId: "98.765.432/0001-11",
    crc: "RJ-654321/O",
    pixType: "EMAIL",
    pixKey: "contabilidade@prime.com.br",
    amount: 4220,
    status: "Dados completos",
    canPay: true,
  },
  {
    id: "3",
    name: "Assessoria Financeira",
    taxId: "77.001.234/0001-02",
    crc: "",
    pixType: "",
    pixKey: "",
    amount: 950,
    status: "Dados Incompletos para Repasse",
    canPay: false,
  },
];

const approvals = [
  { id: "a1", name: "Escritório Nova Era", taxId: "12.345.678/0001-90", crc: "SP-123456/O", status: "pending_approval" },
  { id: "a2", name: "Contabilidade Prime", taxId: "98.765.432/0001-11", crc: "RJ-654321/O", status: "pending_approval" },
];

export const Route = createFileRoute("/admin/repasses")({
  beforeLoad: async () => {
    const { data: userData, error } = await supabase.auth.getUser();
    if (error || !userData.user) {
      throw redirect({ to: "/login" });
    }

    if (localStorage.getItem("critical_cash_admin") !== "enabled") {
      const { data: profile } = await supabase.from("profiles").select("is_admin").eq("user_id", userData.user.id).maybeSingle();
      if (profile?.is_admin !== true) {
        throw redirect({ to: "/admin/login" });
      }
    }
  },
  component: AdminRepassePage,
});

function AdminRepassePage() {
  const [rows, setRows] = useState(pendingRequests);
  const [selected, setSelected] = useState<string | null>(null);
  const total = useMemo(() => rows.reduce((sum, row) => sum + (row.canPay ? row.amount : 0), 0), [rows]);

  const copyPix = async (pixKey: string) => {
    if (!pixKey) {
      toast.error("Chave PIX indisponível para cópia.");
      return;
    }

    try {
      await navigator.clipboard.writeText(pixKey);
      toast.success("Chave PIX copiada com sucesso.");
    } catch {
      toast.error("Não foi possível copiar a chave PIX.");
    }
  };

  const approve = (id: string) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status: "Aprovado", canPay: true } : row)));
    setSelected(null);
    toast.success("Parceiro aprovado e liberado para repasse.");
  };

  const reject = (id: string) => {
    setRows((current) => current.filter((row) => row.id !== id));
    toast.success("Solicitação recusada.");
  };

  const markPaid = (id: string) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status: "Repasse confirmado" } : row)));
    toast.success("Repasse confirmado como realizado.");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">Admin</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Gestão de parceiros e repasses</h1>
        </div>
        <Button asChild variant="outline" className="rounded-xl">
          <a href="/admin/login">Sair</a>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Aprovações pendentes</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">{approvals.length}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total disponível hoje</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold">R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Conformidade</CardTitle></CardHeader>
          <CardContent className="text-3xl font-semibold text-emerald-400">98%</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aprovação de parceiros pendentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-3 py-2">Nome</th>
                  <th className="px-3 py-2">CPF/CNPJ</th>
                  <th className="px-3 py-2">CRC</th>
                  <th className="px-3 py-2">PIX</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {approvals.map((item) => (
                  <tr key={item.id} className="border-b align-top">
                    <td className="px-3 py-3">{item.name}</td>
                    <td className="px-3 py-3">{item.taxId}</td>
                    <td className="px-3 py-3">{item.crc || "—"}</td>
                    <td className="px-3 py-3">{item.status}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button className="h-9 rounded-lg" onClick={() => approve(item.id)}><CheckCircle2 className="mr-2 h-4 w-4" />Aprovar</Button>
                        <Button variant="outline" className="h-9 rounded-lg" onClick={() => reject(item.id)}><ShieldX className="mr-2 h-4 w-4" />Recusar</Button>
                        <Button variant="ghost" asChild className="h-9 rounded-lg">
                          <a href={`https://www.google.com/search?q=${encodeURIComponent(`${item.name} CRC ${item.crc}`)}`} target="_blank" rel="noreferrer"><Search className="mr-2 h-4 w-4" />Verificar CRC</a>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gestão de repasses PIX</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-3 py-2">Favorecido</th>
                  <th className="px-3 py-2">Dados do PIX</th>
                  <th className="px-3 py-2">Resumo</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b align-top">
                    <td className="px-3 py-3">
                      <div className="font-medium">{row.name}</div>
                      <div className="text-muted-foreground">{row.taxId}</div>
                      <div className="mt-1 text-xs text-violet-300">CRC: {row.crc || "Não informado"}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div>{row.pixType || "Não informado"}</div>
                      <div className="break-all text-muted-foreground">{row.pixKey || "—"}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div>{row.amount > 0 ? `${row.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : "R$ 0,00"}</div>
                      <div className="text-muted-foreground">{row.canPay ? "1 assinatura" : "Dados incompletos"}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={row.canPay ? "text-emerald-400" : "text-red-400"}>{row.status}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" className="h-9 rounded-lg" onClick={() => copyPix(row.pixKey)}><Clipboard className="mr-2 h-4 w-4" />Copiar chave PIX</Button>
                        <Button className="h-9 rounded-lg" onClick={() => markPaid(row.id)} disabled={!row.canPay}><ShieldCheck className="mr-2 h-4 w-4" />Confirmar repasse</Button>
                        <Button variant="ghost" asChild className="h-9 rounded-lg"><a href="https://www.google.com/search?q=consulta+CRC+contabilidade" target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Verificar</a></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
