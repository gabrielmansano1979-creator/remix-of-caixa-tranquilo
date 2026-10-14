import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, Building2, Clipboard, Download, FileText, LoaderCircle, Mail, MapPin, Phone, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { isValidCpfCnpj, isValidCrcNumber, normalizeCpfCnpj } from "@/lib/identity";
import {
  exportReport,
  formatPixKeyType,
  getPartnerAffiliateLinks,
  type ReportFormat,
} from "@/lib/reporting";

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

const empty = { full_name: "", tax_id: "", crc_number: "", pix_type: "", pix_key: "", phone: "", city: "", state: "", office_name: "" };
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
  const state = query.data?.status;
  const dashboard = query.data?.dashboard;
  useEffect(() => {
    if (state && state.status !== "none") {
      setForm({
        ...empty,
        full_name: state.full_name ?? "",
        tax_id: state.tax_id ?? "",
        crc_number: state.crc_number ?? "",
        pix_type: state.pix_type ?? "",
        pix_key: state.pix_key ?? "",
      });
    }
  }, [state]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const taxId = normalizeCpfCnpj(form.tax_id);
    if (!isValidCpfCnpj(taxId))
      return toast.error("Informe um CPF ou CNPJ válido, com dígitos verificadores corretos.");
    if (!isValidCrcNumber(form.crc_number))
      return toast.error("Informe o CRC completo, por exemplo SP-123456/O-3. Registros transferidos ou secundários podem incluir T-UF ou S-UF.");
    if (form.phone.replace(/\D/g, "").length < 10 || form.phone.replace(/\D/g, "").length > 11)
      return toast.error("Informe um telefone com DDD.");
    if (!form.city.trim() || !/^[A-Za-zÀ-ÿ]{2}$/.test(form.state.trim()))
      return toast.error("Informe a cidade e a UF.");
    if (Boolean(form.pix_type) !== Boolean(form.pix_key.trim()))
      return toast.error("Para informar o PIX agora, preencha o tipo e a chave; ou deixe os dois campos vazios para cadastrar depois.");
    if (!documents.crc || !documents.identity || !documents.address)
      return toast.error("Anexe a comprovação do CRC, o documento de identidade e o comprovante de endereço.");
    for (const [label, file] of [
      ["registro no CRC", documents.crc],
      ["documento de identidade", documents.identity],
      ["comprovante de endereço", documents.address],
    ] as const) {
      if (!file) continue;
      const extension = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
      if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(extension))
        return toast.error("O arquivo de " + label + " deve ser PDF, CSV ou Excel (.xls/.xlsx).");
      if (file.size > MAX_DOCUMENT_SIZE)
        return toast.error("O arquivo de " + label + " deve ter no máximo 10 MB.");
    }
    setBusy(true);
    const uploadedPaths: string[] = [];
    let applicationSubmitted = false;
    let userId: string | null = null;
    let previousDocuments: {
      user_id: string;
      phone: string;
      city: string;
      state: string;
      office_name: string | null;
      crc_document_path: string;
      identity_document_path: string;
      address_document_path: string;
      submitted_at: string;
    } | null = null;
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Sua sessão expirou. Entre novamente.");
      userId = authData.user.id;
      const { data: priorDocuments, error: priorDocumentsError } = await supabase
        .from("partner_application_documents")
        .select("user_id, phone, city, state, office_name, crc_document_path, identity_document_path, address_document_path, submitted_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (priorDocumentsError) throw priorDocumentsError;
      previousDocuments = priorDocuments;
      const uploadDocument = async (file: File, label: string) => {
        const extension = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
        const safeName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-100);
        const path = userId + "/" + label + "-" + Date.now() + "-" + safeName;
        const { error } = await supabase.storage.from("partner-application-documents").upload(path, file, {
          contentType: DOCUMENT_MIME_BY_EXTENSION[extension],
          upsert: false,
        });
        if (error) throw error;
        uploadedPaths.push(path);
        return path;
      };
      // Upload sequentially so a failed upload cannot leave a Promise.all sibling
      // completing after the compensating cleanup has already finished.
      const crcPath = await uploadDocument(documents.crc, "crc");
      const identityPath = await uploadDocument(documents.identity, "identidade");
      const addressPath = await uploadDocument(documents.address, "endereco");
      const { error: documentsError } = await supabase.from("partner_application_documents").upsert({
        user_id: userId,
        phone: form.phone.trim(),
        city: form.city.trim(),
        state: form.state.trim().toUpperCase(),
        office_name: form.office_name.trim() || null,
        crc_document_path: crcPath,
        identity_document_path: identityPath,
        address_document_path: addressPath,
        submitted_at: new Date().toISOString(),
      });
      if (documentsError) throw documentsError;
      const { error } = await supabase.rpc("submit_partner_request", {
        _full_name: form.full_name.trim(),
        _tax_id: taxId,
        _crc_number: form.crc_number.trim().toUpperCase(),
        _pix_type: form.pix_type || null,
        _pix_key: form.pix_key.trim() || null,
      });
      if (error) throw error;
      applicationSubmitted = true;
      setShowApplicationForm(false);
      await queryClient.invalidateQueries({ queryKey: ["partner-area"] });
      toast.success("Solicitação e documentos enviados para avaliação do administrador.");
    } catch (error) {
      if (!applicationSubmitted && userId && uploadedPaths.length > 0) {
        // Do not roll back if the RPC may have committed but its response was lost.
        const { data: latestStatus, error: statusCheckError } = await supabase.rpc("my_partner_status");
        if (statusCheckError) {
          console.error("Document rollback skipped because submission status could not be verified", statusCheckError);
        } else {
          const status = (latestStatus as PartnerPageData | null)?.status ?? "none";
          const requestAllowsRollback = status === "none" || status === "rejected";

          if (requestAllowsRollback) {
            let metadataRestored = false;
            if (previousDocuments) {
              const { error: restoreError } = await supabase
                .from("partner_application_documents")
                .upsert(previousDocuments);
              if (restoreError) {
                console.error("Failed to restore previous partner document metadata", restoreError);
              } else {
                metadataRestored = true;
              }
            } else {
              const { error: deleteMetadataError } = await supabase
                .from("partner_application_documents")
                .delete()
                .eq("user_id", userId);
              if (deleteMetadataError) {
                console.error("Failed to remove orphaned partner document metadata", deleteMetadataError);
              } else {
                metadataRestored = true;
              }
            }

            if (metadataRestored) {
              const previousPaths = new Set([
                previousDocuments?.crc_document_path,
                previousDocuments?.identity_document_path,
                previousDocuments?.address_document_path,
              ].filter((value): value is string => Boolean(value)));
              const pathsToRemove = uploadedPaths.filter((path) => !previousPaths.has(path));
              if (pathsToRemove.length > 0) {
                const { error: cleanupError } = await supabase.storage
                  .from("partner-application-documents")
                  .remove(pathsToRemove);
                if (cleanupError) {
                  console.error("Failed to clean up orphaned partner application documents", cleanupError);
                }
              }
            }
          }
        }
      }
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a solicitação.");
    } finally {
      setBusy(false);
    }
  };

  const savePayout = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.pix_type || !form.pix_key.trim()) {
      toast.error("Informe o tipo e a chave PIX para liberar o cupom.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc("update_partner_payout", {
        _pix_type: form.pix_type,
        _pix_key: form.pix_key.trim(),
      });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["partner-area"] });
      toast.success("Dados de recebimento salvos. Seu cupom foi atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar os dados de recebimento.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Link copiado.");
    } catch {
      toast.error("Não foi possível copiar o link.");
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

  if (state?.status !== "approved") {
    const canApply = state?.status !== "pending_approval";
    return (
      <div className="mx-auto max-w-4xl space-y-6 py-8">
        <header className="space-y-3">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
            <UserRound className="h-4 w-4" /> Programa de parceiros
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Contador Afiliado</h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
            Área exclusiva para contadores com registro profissional válido no CRC. Não é destinada a outros perfis profissionais. A aprovação depende da conferência dos dados e documentos comprobatórios.
          </p>
        </header>
        {state?.status === "pending_approval" && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="flex gap-3 p-5">
              <LoaderCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <h2 className="font-semibold">Solicitação em análise</h2>
                <p className="mt-1 text-sm text-muted-foreground">Seus dados e documentos foram enviados. O administrador avaliará a solicitação e registrará a aprovação ou a recusa. Os links de indicação serão liberados após a aprovação.</p>
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
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-2"><div className="mb-1 grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><BadgeCheck className="h-5 w-5" /></div><CardTitle className="text-base">Comissão recorrente</CardTitle></CardHeader>
                <CardContent><div className="grid grid-cols-3 gap-2"><div><p className="text-2xl font-bold">20%</p><p className="text-xs text-muted-foreground">1–5 clientes</p></div><div><p className="text-2xl font-bold">25%</p><p className="text-xs text-muted-foreground">6–15 clientes</p></div><div><p className="text-2xl font-bold">30%</p><p className="text-xs text-muted-foreground">16–30 clientes</p></div></div><p className="mt-3 text-sm text-muted-foreground">A faixa muda automaticamente conforme clientes únicos com pagamento confirmado. Acima de 30 clientes, a comissão permanece em 30%.</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><div className="mb-1 grid h-10 w-10 place-items-center rounded-xl bg-muted text-foreground"><Building2 className="h-5 w-5" /></div><CardTitle className="text-base">Indicação profissional</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-relaxed text-muted-foreground">Compartilhe links e cupom exclusivos com clientes que possam se beneficiar do controle de caixa.</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><div className="mb-1 grid h-10 w-10 place-items-center rounded-xl bg-muted text-foreground"><ShieldCheck className="h-5 w-5" /></div><CardTitle className="text-base">Análise pelo administrador</CardTitle></CardHeader>
                <CardContent><p className="text-sm leading-relaxed text-muted-foreground">O cadastro é analisado antes da liberação. Seus documentos ficam em área privada e só podem ser consultados por você e pelos administradores autorizados.</p></CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader><CardTitle>Como funciona</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>1. Preencha seus dados profissionais e fiscais.</p>
                <p>2. Envie a comprovação de registro no CRC, um documento de identidade e um comprovante de endereço.</p>
                <p>3. O administrador analisará o cadastro e registrará a decisão. Se aprovado, você terá acesso ao painel, aos links de indicação e ao acompanhamento das comissões.</p>
                <p className="border-t pt-3">Comissão recorrente: 20% para 1–5 clientes pagantes, 25% para 6–15 e 30% para 16–30. A partir do 31º cliente, a comissão continua em 30%. Só contam clientes únicos com pagamento confirmado. Clientes que assinarem pelo seu link ou cupom recebem 20% de desconto.</p>
              </CardContent>
            </Card>
            <Button className="h-12 w-full rounded-xl text-base sm:w-auto" onClick={() => setShowApplicationForm(true)}>Quero ser um contador afiliado <ArrowLeft className="ml-2 h-4 w-4 rotate-180" /></Button>
          </>
        )}
        {canApply && showApplicationForm && (
          <Card>
            <CardHeader>
              <Button type="button" variant="ghost" className="mb-1 w-fit px-0" onClick={() => setShowApplicationForm(false)}><ArrowLeft className="mr-2 h-4 w-4" />Voltar às informações do programa</Button>
              <CardTitle>Quero ser um contador afiliado</CardTitle>
              <p className="text-sm text-muted-foreground">Área exclusiva para contadores. Informe seus dados civis e profissionais e anexe cópias legíveis do CRC, da identidade e do comprovante de endereço. Envie digitalizações/fotos convertidas em PDF ou arquivos PDF, CSV e Excel (.xls/.xlsx), até 10 MB por arquivo. O PIX é opcional nesta etapa e pode ser cadastrado após a aprovação.</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="partner-name">Nome civil completo, como consta no documento</Label><Input id="partner-name" required minLength={2} maxLength={160} autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="partner-doc">CPF ou CNPJ</Label><Input id="partner-doc" required inputMode="text" autoCapitalize="characters" autoComplete="off" placeholder="CPF ou CNPJ" value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value.toUpperCase() })} /><p className="text-xs leading-relaxed text-muted-foreground">O CNPJ tradicional, só com números (11.222.333/0001-81), continua aceito. Também aceitamos o novo formato alfanumérico (12.ABC.345/01DE-35).</p></div>
                <div className="space-y-1.5"><Label htmlFor="partner-crc">Número de registro no CRC</Label><Input id="partner-crc" required placeholder="SP-123456/O-3" autoCapitalize="characters" value={form.crc_number} onChange={(e) => setForm({ ...form, crc_number: e.target.value.toUpperCase() })} /><p className="text-xs text-muted-foreground">Informe o registro completo, incluindo o dígito verificador. Registros transferidos ou secundários podem incluir T-UF ou S-UF.</p></div>
                <div className="space-y-1.5"><Label htmlFor="partner-phone"><Phone className="mr-1 inline h-3.5 w-3.5" />Telefone com DDD</Label><Input id="partner-phone" required type="tel" autoComplete="tel" placeholder="(11) 99999-9999" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="partner-city"><MapPin className="mr-1 inline h-3.5 w-3.5" />Cidade</Label><Input id="partner-city" required autoComplete="address-level2" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="partner-state">Estado (UF)</Label><Input id="partner-state" required minLength={2} maxLength={2} placeholder="SP" autoComplete="address-level1" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} /></div>
                <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="partner-office"><Building2 className="mr-1 inline h-3.5 w-3.5" />Escritório contábil (opcional)</Label><Input id="partner-office" maxLength={180} value={form.office_name} onChange={(e) => setForm({ ...form, office_name: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="partner-pix-type">Tipo de chave PIX (opcional)</Label><select id="partner-pix-type" className="mt-1.5 h-11 w-full rounded-xl border bg-background px-3 text-sm" value={form.pix_type} onChange={(e) => setForm({ ...form, pix_type: e.target.value })}><option value="">Cadastrar depois</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="random">Aleatória</option></select></div>
                <div className="space-y-1.5"><Label htmlFor="partner-pix-key">Chave PIX para recebimento (opcional)</Label><Input id="partner-pix-key" maxLength={180} value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} /></div>
                <div className="space-y-2 rounded-xl border p-4 sm:col-span-2"><Label htmlFor="partner-doc-crc">Comprovação de registro no CRC *</Label><p className="text-xs text-muted-foreground">Certidão de regularidade ou carteira profissional do Conselho Regional de Contabilidade.</p><Input id="partner-doc-crc" type="file" required accept=".pdf,.csv,.xls,.xlsx,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="h-auto min-h-11 py-2" onChange={(e) => setDocuments({ ...documents, crc: e.target.files?.[0] ?? null })} />{documents.crc && <p className="text-xs text-success"><FileText className="mr-1 inline h-3.5 w-3.5" />{documents.crc.name}</p>}</div>
                <div className="space-y-2 rounded-xl border p-4 sm:col-span-2"><Label htmlFor="partner-doc-identity">Documento de identidade com foto *</Label><p className="text-xs text-muted-foreground">RG ou CNH, frente e verso no mesmo arquivo quando aplicável.</p><Input id="partner-doc-identity" type="file" required accept=".pdf,.csv,.xls,.xlsx,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="h-auto min-h-11 py-2" onChange={(e) => setDocuments({ ...documents, identity: e.target.files?.[0] ?? null })} />{documents.identity && <p className="text-xs text-success"><FileText className="mr-1 inline h-3.5 w-3.5" />{documents.identity.name}</p>}</div>
                <div className="space-y-2 rounded-xl border p-4 sm:col-span-2"><Label htmlFor="partner-doc-address">Comprovante de endereço *</Label><p className="text-xs text-muted-foreground">Documento recente que mostre o nome e o endereço informado.</p><Input id="partner-doc-address" type="file" required accept=".pdf,.csv,.xls,.xlsx,application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="h-auto min-h-11 py-2" onChange={(e) => setDocuments({ ...documents, address: e.target.files?.[0] ?? null })} />{documents.address && <p className="text-xs text-success"><FileText className="mr-1 inline h-3.5 w-3.5" />{documents.address.name}</p>}</div>
                <p className="text-xs leading-relaxed text-muted-foreground sm:col-span-2"><Mail className="mr-1 inline h-3.5 w-3.5" />A solicitação será vinculada ao e-mail da sua conta. Os arquivos serão armazenados em área privada para avaliação administrativa.</p>
                <Button type="submit" disabled={busy} className="h-12 rounded-xl sm:col-span-2">{busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Enviar documentação para avaliação</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  const links = getPartnerAffiliateLinks(state.coupon?.code ?? "");
  const confirmedReferrals = dashboard?.totals.referred_clients ?? 0;
  const referralGoal = confirmedReferrals <= 5
    ? { target: 5, nextRate: 25, nextCount: 6 }
    : confirmedReferrals <= 15
      ? { target: 15, nextRate: 30, nextCount: 16 }
      : { target: 30, nextRate: 30, nextCount: 31 };
  const referralProgress = Math.min(100, Math.round((confirmedReferrals / referralGoal.target) * 100));
  const history = dashboard?.commissions ?? [];
  const clientRows = dashboard?.clients ?? [];
  const commissionRows = history.map((item) => ({
    cliente: item.client_name ?? "Cliente",
    base_calculo: item.payment_amount_cents == null ? "—" : money(item.payment_amount_cents),
    taxa: item.commission_percent == null ? "—" : `${item.commission_percent}%`,
    valor: money(item.amount_cents),
    situacao: statusLabelPt(item.status),
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
  const exportCommissions = async (format: ReportFormat) => {
    try {
      await exportReport({
        title: "Extrato de comissões",
        fileName: "extrato-comissoes",
        format,
        columns: [
          { key: "cliente", label: "Cliente" },
          { key: "base_calculo", label: "Valor pago após desconto" },
          { key: "taxa", label: "Taxa de comissão" },
          { key: "valor", label: "Comissão" },
          { key: "situacao", label: "Situação" },
          { key: "data", label: "Data" },
          { key: "pago_em", label: "Pago em" },
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
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Parceiro contábil
        </p>
        <h1 className="mt-2 text-3xl font-bold">Painel do contador</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Acompanhe indicações, comissões e os clientes que autorizaram acesso aos seus relatórios.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Comissões acumuladas"
          value={money(dashboard?.totals.commission_cents ?? 0)}
        />
        <Metric label="Aguardando pagamento" value={money(dashboard?.totals.pending_cents ?? 0)} />
        <Metric
          label="Clientes indicados"
          value={String(dashboard?.totals.referred_clients ?? 0)}
        />
        <Metric label="Assinaturas ativas" value={String(dashboard?.totals.active_clients ?? 0)} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Meta de comissão por clientes pagantes</CardTitle>
          <p className="text-sm text-muted-foreground">Só contam clientes que usaram seu cupom e tiveram o pagamento confirmado pelo sistema.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-3xl font-bold">{state.coupon?.commission_percent ?? 20}%</p><p className="text-sm text-muted-foreground">Comissão recorrente atual</p></div>
            <p className="text-sm font-medium">{confirmedReferrals} de {referralGoal.target} clientes da faixa</p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={referralGoal.target} aria-valuenow={Math.min(confirmedReferrals, referralGoal.target)} aria-label="Progresso da meta de clientes pagantes">
            <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${referralProgress}%` }} />
          </div>
          {confirmedReferrals <= 5
            ? <p className="text-sm text-muted-foreground">Faixa inicial: 20% para 1–5 clientes pagantes. Ao confirmar o pagamento do 6º cliente, a comissão passa para 25%.</p>
            : confirmedReferrals <= 15
              ? <p className="text-sm text-muted-foreground">Faixa atual: 25% para 6–15 clientes pagantes. Ao confirmar o pagamento do 16º cliente, a comissão passa para 30%.</p>
              : confirmedReferrals <= 30
                ? <p className="text-sm text-muted-foreground">Faixa atual: 30% para 16–30 clientes pagantes. A comissão permanece em 30% após o 30º cliente.</p>
                : <p className="text-sm text-muted-foreground">Você já ultrapassou 30 clientes pagantes: sua comissão recorrente continua em 30%.</p>}
          <p className="text-xs text-muted-foreground">As metas consideram pagamentos confirmados, não apenas cadastros ou cliques no cupom.</p>
          <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">Seus clientes indicados recebem 20% de desconto. Sua comissão é calculada sobre o valor efetivamente pago pelo cliente após esse desconto, usando a faixa de 20%, 25% ou 30% correspondente.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dados para recebimento das comissões</CardTitle>
          <p className="text-sm text-muted-foreground">O cupom só fica ativo quando o PIX para recebimento estiver cadastrado.</p>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={savePayout}>
            <div className="space-y-1.5">
              <Label htmlFor="payout-pix-type">Tipo de chave PIX</Label>
              <select id="payout-pix-type" required value={form.pix_type} onChange={(e) => setForm({ ...form, pix_type: e.target.value })} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
                <option value="">Selecione</option><option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="phone">Telefone</option><option value="random">Aleatória</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payout-pix-key">Chave PIX</Label>
              <Input id="payout-pix-key" required maxLength={180} value={form.pix_key} onChange={(e) => setForm({ ...form, pix_key: e.target.value })} />
            </div>
            <Button type="submit" disabled={busy} className="sm:col-span-2 sm:w-fit">{busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Salvar dados de recebimento</Button>
          </form>
        </CardContent>
      </Card>

      {state.coupon ? <Card>
        <CardHeader><CardTitle>Links de indicação</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <LinkCard title="Landing page" value={links.home} onCopy={() => copy(links.home)} />
          <LinkCard title="Checkout com desconto de 10%" value={links.checkout} onCopy={() => copy(links.checkout)} />
          <p className="text-sm text-muted-foreground md:col-span-2">
            Cupom <strong className="text-foreground">{state.coupon.code}</strong> · Comissão recorrente atual de {state.coupon.commission_percent}%.
          </p>
        </CardContent>
      </Card> : <Card>
        <CardHeader><CardTitle>Cupom ainda não liberado</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Cadastre sua chave PIX acima para ativar o cupom e liberar os links de indicação.</CardContent>
      </Card>}

      <Card>
        <CardHeader><CardTitle>Clientes indicados com pagamento confirmado</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">A lista é atualizada automaticamente quando o pagamento do cliente é confirmado.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead><tr className="border-b text-xs text-muted-foreground">
                {["Cliente", "Plano", "Situação", "Indicado em", "Pagamento confirmado"].map((heading) => <th key={heading} className="px-3 py-3 font-medium">{heading}</th>)}
              </tr></thead>
              <tbody>
                {(dashboard?.referrals ?? []).length ? (dashboard?.referrals ?? []).map((item) => (
                  <tr key={item.user_id} className="border-b last:border-0">
                    <td className="px-3 py-3 font-medium">{item.client_name || "Cliente"}</td>
                    <td className="px-3 py-3">{planLabelPt(item.plan)}</td>
                    <td className="px-3 py-3">{statusLabelPt(item.status)}</td>
                    <td className="px-3 py-3">{new Date(item.created_at).toLocaleDateString("pt-BR")}</td>
                    <td className="px-3 py-3">{item.paid_at ? new Date(item.paid_at).toLocaleDateString("pt-BR") : "—"}</td>
                  </tr>
                )) : <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Nenhum cliente com pagamento confirmado pelo seu cupom ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
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
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Histórico de comissões e saques via PIX</CardTitle>
          <ExportButtons onExport={exportCommissions} />
        </CardHeader>
        <CardContent>
          <DataTable
            headers={["Cliente", "Valor pago após desconto", "Taxa", "Comissão", "Status", "Criada em", "Paga em"]}
            rows={commissionRows.map((row) => Object.values(row))}
            empty="Nenhuma comissão registrada."
          />
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Chave PIX cadastrada: {formatPixKeyType(state.pix_type ?? "")} · {state.pix_key}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="num text-2xl font-semibold">{value}</CardContent>
    </Card>
  );
}

function LinkCard({ title, value, onCopy }: { title: string; value: string; onCopy: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border bg-muted/30 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{title}</p>
        <p className="truncate text-sm">{value}</p>
      </div>
      <Button variant="outline" size="icon" aria-label={`Copiar ${title}`} onClick={onCopy}>
        <Clipboard className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ExportButtons({ onExport }: { onExport: (format: ReportFormat) => Promise<void> }) {
  return (
    <div className="flex gap-1">
      {(["pdf", "excel", "csv"] as const).map((format) => (
        <Button key={format} variant="outline" size="sm" onClick={() => void onExport(format)}>
          <Download className="mr-1 h-3.5 w-3.5" />
          {format.toUpperCase()}
        </Button>
      ))}
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
