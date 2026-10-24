import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ArrowLeft, FileText, Plus, ShieldCheck, CircleAlert, RefreshCw, Loader2, CheckCircle2, X, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isValidCpfCnpj, normalizeCpfCnpj } from "@/lib/identity";
import { nfseDraftSchema } from "@/lib/fiscal/nfse/draft-schema";
import { emitNfseAction } from "@/lib/fiscal/nfse/emit-nfse.functions";

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
  municipio_prestacao_ibge: string | null;
  recipient_name: string;
  recipient_tax_id: string;
  service_description: string;
  amount_cents: number;
  competencia: string | null;
  codigo_trib_nacional: string | null;
  cnae: string | null;
  iss_retido: boolean | null;
  aliquota_iss: number | null;
  serie: string | null;
  numero_dps: number | null;
  status: string;
  invoice_number: string | null;
  created_at: string;
  user_id: string;
  created_by_user_id: string;
};

type EmissionFeedback =
  | { kind: "missing"; title: string; message: string; missingFields: Array<{ field: string; label: string; message: string }> }
  | { kind: "success"; title: string; message: string; dps: string; protocol: string | null; accessKey: string | null }
  | { kind: "rejected"; title: string; message: string; dps: string; protocol: string | null };

type AccountantPortal = { authorized_clients: Array<{ client_user_id: string; client_name: string; business_size: string | null }> };

const digits = (value: string) => value.replace(/\D/g, "");
const parseAmountCents = (value: string) => {
  const raw = value.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : Number.NaN;
};
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const fiscalDb = supabase as any;

function FiscalInvoicesPage() {
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [emittingInvoiceId, setEmittingInvoiceId] = useState<string | null>(null);
  const [emissionFeedback, setEmissionFeedback] = useState<EmissionFeedback | null>(null);
  const [issuerName, setIssuerName] = useState("");
  const [issuerCnpj, setIssuerCnpj] = useState("");
  const [cityCode, setCityCode] = useState("");
  const [serviceCityCode, setServiceCityCode] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientTaxId, setRecipientTaxId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [competencia, setCompetencia] = useState("");
  const [codigoTribNacional, setCodigoTribNacional] = useState("");
  const [cnae, setCnae] = useState("");
  const [issRetido, setIssRetido] = useState(false);
  const [aliquotaIss, setAliquotaIss] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");

  const portalQuery = useQuery({
    queryKey: ["nfse-authorized-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_accountant_portal_invites");
      if (error) throw error;
      return data as unknown as AccountantPortal;
    },
  });

  const query = useQuery({
    queryKey: ["fiscal-invoices"],
    queryFn: async () => {
      const { data, error } = await fiscalDb.from("fiscal_invoices").select("*").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as Draft[];
    },
  });

  const emitNfse = async (item: Draft) => {
    if (emittingInvoiceId) return;
    setEmittingInvoiceId(item.id);
    setEmissionFeedback(null);
    try {
      const result = await emitNfseAction({
        data: {
          invoiceId: item.id,
          empresaTenantId: item.user_id,
        },
      });

      if ("missingFields" in result) {
        setEmissionFeedback({
          kind: "missing",
          title: "Faltam dados para emitir a NFS-e",
          message: result.message,
          missingFields: result.missingFields,
        });
        return;
      }

      const dps = `${item.serie ?? "—"}/${item.numero_dps ?? "não atribuída"}`;
      if (result.accepted && result.accessKey) {
        const protocol = result.protocol ?? null;
        setEmissionFeedback({
          kind: "success",
          title: "Retorno positivo da transmissão",
          message: "O serviço retornou uma resposta de aceitação. Confira o protocolo e a chave abaixo.",
          dps,
          protocol,
          accessKey: result.accessKey ?? null,
        });
        toast.success("Retorno positivo recebido para a NFS-e.");
        await qc.invalidateQueries({ queryKey: ["fiscal-invoices"] });
      } else {
        setEmissionFeedback({
          kind: "rejected",
          title: "NFS-e não autorizada",
          message: result.rejectionReason ?? "A SEFIN não confirmou a autorização. Consulte o motivo antes de tentar novamente.",
          dps,
          protocol: result.protocol ?? null,
        });
        await qc.invalidateQueries({ queryKey: ["fiscal-invoices"] });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível iniciar a emissão da NFS-e.";
      setEmissionFeedback({
        kind: "rejected",
        title: "Não foi possível concluir a emissão",
        message,
        dps: `${item.serie ?? "—"}/${item.numero_dps ?? "não atribuída"}`,
        protocol: null,
      });
    } finally {
      setEmittingInvoiceId(null);
    }
  };

  const saveDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cents = parseAmountCents(amount);
    const cleanCnpj = normalizeCpfCnpj(issuerCnpj);
    const cleanTaxId = normalizeCpfCnpj(recipientTaxId);
    const cleanCity = digits(cityCode);
    const cleanServiceCity = digits(serviceCityCode);
    if (!selectedClientId || !isValidCpfCnpj(cleanCnpj) || !isValidCpfCnpj(cleanTaxId) || cleanCity.length !== 7 || cleanServiceCity.length !== 7 || !Number.isSafeInteger(cents) || cents <= 0) {
      toast.error("Confira CNPJ, CPF/CNPJ do tomador, os dois códigos IBGE de 7 dígitos e o valor.");
      return;
    }
    const rate = aliquotaIss.trim() === "" ? null : Number(aliquotaIss.replace(",", "."));
    const parsed = nfseDraftSchema.safeParse({
      user_id: selectedClientId,
      issuer_name: issuerName,
      issuer_cnpj: cleanCnpj,
      issuer_city_ibge: cleanCity,
      recipient_name: recipientName,
      recipient_tax_id: cleanTaxId,
      service_description: description,
      amount_cents: cents,
      competencia,
      codigo_trib_nacional: codigoTribNacional,
      cnae,
      iss_retido: issRetido,
      aliquota_iss: rate,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Confira os campos fiscais obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await fiscalDb.from("fiscal_invoices").insert({
        ...parsed.data,
        municipio_prestacao_ibge: cleanServiceCity,
        status: "draft",
      });
      if (error) throw error;
      toast.success("Rascunho salvo. Ele ainda não é uma nota fiscal emitida.");
      setIssuerCnpj(""); setCityCode(""); setServiceCityCode(""); setRecipientName(""); setRecipientTaxId(""); setDescription(""); setAmount(""); setCompetencia(""); setCodigoTribNacional(""); setCnae(""); setIssRetido(false); setAliquotaIss("");
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
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Prepare os dados da NFS-e, confira as pendências fiscais e inicie a emissão nos rascunhos quando a configuração e o certificado estiverem ativos.</p>
        </div>
        <FileText className="h-10 w-10 text-primary" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" />Novo rascunho de NFS-e</CardTitle><CardDescription>Preencha os dados do prestador, tomador e serviço. Não envia nada ao governo nesta etapa.</CardDescription></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={saveDraft}>
              <div className="space-y-2"><Label htmlFor="client-company">Empresa cliente autorizada</Label><select id="client-company" required value={selectedClientId} onChange={e => { const id = e.target.value; setSelectedClientId(id); const client = portalQuery.data?.authorized_clients.find(item => item.client_user_id === id); if (client) setIssuerName(client.client_name); }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" disabled={portalQuery.isLoading || !portalQuery.data?.authorized_clients.length}><option value="">Selecione uma empresa com acesso autorizado</option>{portalQuery.data?.authorized_clients.map(client => <option key={client.client_user_id} value={client.client_user_id}>{client.client_name}{client.business_size ? ` · ${client.business_size}` : ""}</option>)}</select>{portalQuery.isError ? <p className="text-xs text-destructive">O acesso fiscal exige cadastro de contador aprovado e autorização ativa. Não foi possível carregar as empresas autorizadas.</p> : null}{portalQuery.data && portalQuery.data.authorized_clients.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma empresa autorizou seu acesso ainda.</p> : null}</div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="issuer-name">Empresa prestadora</Label><Input id="issuer-name" required minLength={2} maxLength={180} value={issuerName} onChange={e => setIssuerName(e.target.value)} placeholder="Razão social / nome empresarial" /></div>
                <div className="space-y-2"><Label htmlFor="issuer-cnpj">CNPJ do prestador</Label><Input id="issuer-cnpj" required value={issuerCnpj} onChange={e => setIssuerCnpj(e.target.value)} placeholder="CNPJ (14 caracteres)" inputMode="numeric" /></div>
                <div className="space-y-2"><Label htmlFor="city-ibge">Código IBGE do município</Label><Input id="city-ibge" required value={cityCode} onChange={e => setCityCode(e.target.value)} placeholder="7 dígitos" inputMode="numeric" maxLength={7} /></div>
                <div className="space-y-2"><Label htmlFor="service-city-ibge">Código IBGE do município da prestação</Label><Input id="service-city-ibge" required value={serviceCityCode} onChange={e => setServiceCityCode(digits(e.target.value).slice(0, 7))} placeholder="7 dígitos do local do serviço" inputMode="numeric" maxLength={7} /></div>
                <div className="space-y-2"><Label htmlFor="recipient-name">Tomador do serviço</Label><Input id="recipient-name" required minLength={2} maxLength={180} value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="Nome / razão social" /></div>
                <div className="space-y-2"><Label htmlFor="recipient-tax-id">CPF/CNPJ do tomador</Label><Input id="recipient-tax-id" required value={recipientTaxId} onChange={e => setRecipientTaxId(e.target.value)} placeholder="CPF ou CNPJ válido" inputMode="numeric" /></div>
                <div className="space-y-2"><Label htmlFor="amount">Valor do serviço (R$)</Label><Input id="amount" required value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" inputMode="decimal" /></div>
                <div className="space-y-2"><Label htmlFor="competencia">Competência</Label><Input id="competencia" type="date" required value={competencia} onChange={e => setCompetencia(e.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="codigo-trib-nacional">Código de Tributação Nacional</Label><Input id="codigo-trib-nacional" required value={codigoTribNacional} onChange={e => setCodigoTribNacional(digits(e.target.value).slice(0, 6))} placeholder="6 dígitos da tabela oficial" inputMode="numeric" maxLength={6} /><p className="text-xs text-muted-foreground">Use o código correspondente ao serviço na tabela oficial; não confunda com o CNAE. <a className="text-primary underline" href="https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual" target="_blank" rel="noreferrer">Consultar documentação nacional</a>.</p></div>
                <div className="space-y-2"><Label htmlFor="cnae">CNAE da atividade</Label><Input id="cnae" required value={cnae} onChange={e => setCnae(digits(e.target.value).slice(0, 7))} placeholder="7 dígitos" inputMode="numeric" maxLength={7} /></div>
                <div className="space-y-2"><Label htmlFor="iss-retido">ISS retido pelo tomador?</Label><select id="iss-retido" required value={issRetido ? "true" : "false"} onChange={e => setIssRetido(e.target.value === "true")} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="false">Não</option><option value="true">Sim</option></select></div>
                <div className="space-y-2"><Label htmlFor="aliquota-iss">Alíquota do ISS (%)</Label><Input id="aliquota-iss" value={aliquotaIss} onChange={e => setAliquotaIss(e.target.value)} placeholder={issRetido ? "Opcional conforme regra fiscal" : "Obrigatória quando não retido"} inputMode="decimal" required={!issRetido} /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="description">Descrição do serviço</Label><Textarea id="description" required minLength={3} maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Descreva o serviço prestado" rows={4} /></div>
              <Button type="submit" disabled={saving || portalQuery.isLoading || portalQuery.isError || !selectedClientId} className="w-full sm:w-auto">{saving ? "Salvando..." : "Salvar rascunho"}</Button>
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
              <p className="text-xs text-muted-foreground">A ação de emissão valida os dados no servidor e depende de configuração fiscal ativa, certificado válido e esquemas oficiais de validação instalados. Confira sempre o resultado antes de repetir uma tentativa.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Próximos requisitos</CardTitle></CardHeader>
            <CardContent><ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground"><li>Credenciamento e certificado digital do contribuinte.</li><li>Serviço de transmissão seguro no servidor.</li><li>Consulta do resultado e armazenamento do XML/DANFSe oficial.</li><li>Regras de acesso do contador à empresa autorizadora.</li></ul></CardContent>
          </Card>
        </div>
      </div>

      {emissionFeedback ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onClick={() => setEmissionFeedback(null)}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="emission-feedback-title" aria-describedby="emission-feedback-description" className="w-full max-w-lg rounded-xl border bg-background p-6 shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-start gap-3">
              {emissionFeedback.kind === "success" ? <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green-600" /> : <CircleAlert className="mt-0.5 h-6 w-6 shrink-0 text-destructive" />}
              <div className="min-w-0 flex-1">
                <h2 id="emission-feedback-title" className="text-lg font-semibold">{emissionFeedback.title}</h2>
                <p id="emission-feedback-description" className="mt-2 text-sm text-muted-foreground">{emissionFeedback.message}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Fechar aviso" onClick={() => setEmissionFeedback(null)}><X className="h-4 w-4" /></Button>
            </div>
            {emissionFeedback.kind === "missing" ? (
              <div className="mt-5 space-y-3">
                <p className="text-sm font-medium">Revise estes itens:</p>
                <ul className="space-y-3">
                  {emissionFeedback.missingFields.map((field, index) => <li key={`${field.field}-${index}`} className="rounded-lg border p-3"><p className="text-sm font-semibold">{field.label}</p><p className="mt-1 text-sm text-muted-foreground">{field.message}</p></li>)}
                </ul>
                <p className="text-xs text-muted-foreground">Nenhum envio foi realizado quando o servidor retorna pendências de preenchimento.</p>
              </div>
            ) : (
              <div className="mt-5 space-y-3 rounded-lg border p-4 text-sm">
                <p><span className="font-medium">Série/número da DPS:</span> {emissionFeedback.dps}</p>
                <p><span className="font-medium">Protocolo de recebimento:</span> {emissionFeedback.protocol ?? "Não informado pela resposta"}</p>
                {emissionFeedback.kind === "success" && emissionFeedback.accessKey ? <p className="break-all"><span className="font-medium">Chave de acesso:</span> {emissionFeedback.accessKey}</p> : null}
              </div>
            )}
            <div className="mt-6 flex justify-end"><Button type="button" onClick={() => setEmissionFeedback(null)}>Entendi</Button></div>
          </section>
        </div>
      ) : null}

      <Card>
        <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>Rascunhos recentes</CardTitle><CardDescription>Até 100 rascunhos salvos na sua conta.</CardDescription></div><Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></div></CardHeader>
        <CardContent>
          {query.isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : query.isError ? <div className="text-sm text-destructive">Não foi possível carregar os rascunhos. Verifique se a migração fiscal foi aplicada.</div> : query.data?.length ? (
            <div className="space-y-3">{query.data.map(item => <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"><div className="min-w-0"><p className="font-semibold">{item.recipient_name}</p><p className="mt-1 text-sm text-muted-foreground">{item.service_description}</p><p className="mt-1 text-xs text-muted-foreground">Prestador: {item.issuer_name} · CNPJ {item.issuer_cnpj}</p><p className="mt-1 text-xs text-muted-foreground">Competência: {item.competencia ? new Date(`${item.competencia}T12:00:00`).toLocaleDateString("pt-BR") : "—"} · Código nacional: {item.codigo_trib_nacional ?? "—"} · CNAE: {item.cnae ?? "—"}</p><p className="mt-1 text-xs text-muted-foreground">DPS: {item.serie ?? "—"}/{item.numero_dps ?? "aguardando sequência"} · Criado em {new Date(item.created_at).toLocaleString("pt-BR")}</p><p className="mt-1 text-xs text-muted-foreground">Município da prestação (IBGE): {item.municipio_prestacao_ibge ?? "não informado"}</p></div><div className="flex min-w-[170px] flex-col items-end gap-2 text-right"><p className="font-semibold">{money(item.amount_cents)}</p><span className="inline-flex rounded-full bg-muted px-2 py-1 text-xs">{item.status === "issued" ? "Emitida" : item.status === "rejected" ? "Rejeitada" : item.status === "queued" ? "Em processamento / verificar retorno" : "Rascunho · não emitida"}</span>{item.status === "draft" || item.status === "rejected" ? <Button type="button" size="sm" onClick={() => void emitNfse(item)} disabled={emittingInvoiceId !== null} className="w-full">{emittingInvoiceId === item.id ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Validando e emitindo...</> : <><Send className="mr-2 h-4 w-4" />Emitir NFS-e</>}</Button> : null}</div></div>)}</div>
          ) : <p className="text-sm text-muted-foreground">Nenhum rascunho criado ainda.</p>}
        </CardContent>
      </Card>
    </main>
  );
}
