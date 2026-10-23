import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ArrowLeft, FileText, Plus, ShieldCheck, CircleAlert, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/notas-fiscais")({
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/login" });
  },
  head: () => ({ meta: [{ title: "Notas fiscais — Critical Cash" }, { name: "robots", content: "noindex" }] }),
  component: FiscalInvoicesPage,
});

type Draft = {
  id: string;
  issuer_name: string;
  issuer_cnpj: string;
  issuer_city_ibge: string;
  recipient_name: string;
  recipient_tax_id: string;
  service_description: string;
  amount_cents: number;
  status: string;
  invoice_number: string | null;
  created_at: string;
};

const digits = (value: string) => value.replace(/\\D/g, "");
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const fiscalDb = supabase as any;

function FiscalInvoicesPage() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [issuerName, setIssuerName] = useState("");
  const [issuerCnpj, setIssuerCnpj] = useState("");
  const [cityCode, setCityCode] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientTaxId, setRecipientTaxId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const query = useQuery({
    queryKey: ["fiscal-invoices"],
    queryFn: async () => {
      const { data, error } = await fiscalDb.from("fiscal_invoices").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as Draft[];
    },
  });

  const saveDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    const cleanCnpj = digits(issuerCnpj);
    const cleanTaxId = digits(recipientTaxId);
    const cleanCity = digits(cityCode);
    if (cleanCnpj.length !== 14 || cleanTaxId.length !== 11 && cleanTaxId.length !== 14 || cleanCity.length !== 7 || !Number.isSafeInteger(cents) || cents <= 0) {
      toast.error("Confira CNPJ, CPF/CNPJ do tomador, código IBGE de 7 dígitos e valor.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await fiscalDb.from("fiscal_invoices").insert({
        issuer_name: issuerName.trim(),
        issuer_cnpj: cleanCnpj,
        issuer_city_ibge: cleanCity,
        recipient_name: recipientName.trim(),
        recipient_tax_id: cleanTaxId,
        service_description: description.trim(),
        amount_cents: cents,
        status: "draft",
      });
      if (error) throw error;
      toast.success("Rascunho salvo. Ele ainda não é uma nota fiscal emitida.");
      setIssuerName(""); setIssuerCnpj(""); setCityCode(""); setRecipientName(""); setRecipientTaxId(""); setDescription(""); setAmount("");
      await qc.invalidateQueries({ queryKey: ["fiscal-invoices"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o rascunho.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" className="-ml-3 mb-2"><Link to="/contador"><ArrowLeft className="mr-2 h-4 w-4" />Voltar ao painel do contador</Link></Button>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Fiscal · Critical Cash</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Notas fiscais de serviço</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Prepare os dados da NFS-e e mantenha os rascunhos no sistema. A transmissão oficial será habilitada após configurar a integração nacional e o certificado autorizado.</p>
        </div>
        <FileText className="h-10 w-10 text-primary" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />Novo rascunho de NFS-e</CardTitle><CardDescription>Preencha os dados do prestador, tomador e serviço. Não envia nada ao governo nesta etapa.</CardDescription></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={saveDraft}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="issuer-name">Empresa prestadora</Label><Input id="issuer-name" required minLength={2} maxLength={180} value={issuerName} onChange={e => setIssuerName(e.target.value)} placeholder="Razão social / nome empresarial" /></div>
                <div className="space-y-2"><Label htmlFor="issuer-cnpj">CNPJ do prestador</Label><Input id="issuer-cnpj" required value={issuerCnpj} onChange={e => setIssuerCnpj(e.target.value)} placeholder="00.000.000/0000-00" inputMode="numeric" /></div>
                <div className="space-y-2"><Label htmlFor="city-ibge">Código IBGE do município</Label><Input id="city-ibge" required value={cityCode} onChange={e => setCityCode(e.target.value)} placeholder="7 dígitos" inputMode="numeric" maxLength={7} /></div>
                <div className="space-y-2"><Label htmlFor="recipient-name">Tomador do serviço</Label><Input id="recipient-name" required minLength={2} maxLength={180} value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Nome / razão social" /></div>
                <div className="space-y-2"><Label htmlFor="recipient-tax-id">CPF/CNPJ do tomador</Label><Input id="recipient-tax-id" required value={recipientTaxId} onChange={e => setRecipientTaxId(e.target.value)} placeholder="CPF ou CNPJ" inputMode="numeric" /></div>
                <div className="space-y-2"><Label htmlFor="amount">Valor do serviço (R$)</Label><Input id="amount" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" inputMode="decimal" /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="description">Descrição do serviço</Label><Textarea id="description" required minLength={3} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Descreva o serviço prestado" rows={4} /></div>
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">{saving ? "Salvando..." : "Salvar rascunho"}</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" />Integração oficial</CardTitle><CardDescription>NFS-e Padrão Nacional</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex gap-2 text-warning"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />A emissão real não pode ser ativada apenas com uma chave genérica de API.</p>
              <p>O contribuinte precisa de credenciamento no Painel do Contribuinte e dos requisitos de certificado digital definidos pelo ambiente oficial. As credenciais devem ser processadas no servidor, nunca no navegador.</p>
              <a className="text-primary underline underline-offset-4" href="https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual" target="_blank" rel="noreferrer">Documentação técnica oficial da API</a>
              <p className="text-xs text-muted-foreground">Estado atual: preparação de rascunhos. Nenhum documento é transmitido nem recebe número fiscal nesta versão.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Próximos requisitos</CardTitle></CardHeader>
            <CardContent><ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground"><li>Credenciamento e certificado digital do contribuinte.</li><li>Serviço de transmissão seguro no servidor.</li><li>Consulta do resultado e armazenamento do XML/DANFSe oficial.</li><li>Regras de acesso do contador à empresa autorizadora.</li></ul></CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Rascunhos recentes</CardTitle><CardDescription>Até 100 rascunhos salvos na sua conta.</CardDescription></div><Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></div></CardHeader>
        <CardContent>
          {query.isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : query.isError ? <div className="text-sm text-destructive">Não foi possível carregar os rascunhos. Verifique se a migração fiscal foi aplicada.</div> : query.data?.length ? (
            <div className="space-y-3">{query.data.map(item => <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"><div className="min-w-0"><p className="font-semibold">{item.recipient_name}</p><p className="mt-1 text-sm text-muted-foreground">{item.service_description}</p><p className="mt-1 text-xs text-muted-foreground">Prestador: {item.issuer_name} · CNPJ {item.issuer_cnpj}</p><p className="mt-1 text-xs text-muted-foreground">Criado em {new Date(item.created_at).toLocaleString("pt-BR")}</p></div><div className="text-right"><p className="font-semibold">{money(item.amount_cents)}</p><span className="mt-1 inline-flex rounded-full bg-muted px-2 py-1 text-xs">Rascunho · não emitida</span></div></div>)}</div>
          ) : <p className="text-sm text-muted-foreground">Nenhum rascunho criado ainda.</p>}
        </CardContent>
      </Card>
    </main>
  );
}
