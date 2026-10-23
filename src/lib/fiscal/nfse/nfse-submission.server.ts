import { createFiscalMtlsConnection } from "../security/mtls-agent.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type NfseOfficialResult = {
  accepted: boolean;
  accessKey?: string;
  protocol?: string;
  statusCode: string;
  rejectionReason?: string;
  responseBody: unknown;
};

type NfseTransport = {
  /** Implement from the current official SEFIN Nacional OpenAPI contract. */
  queryByDps(input: { baseUrl: string; agent: import("node:https").Agent; numeroDps: string; serie: string }): Promise<NfseOfficialResult | null>;
  /** Must send the signed, XSD-validated DPS using the current official contract. */
  submitSignedDps(input: { baseUrl: string; agent: import("node:https").Agent; signedXml: string }): Promise<NfseOfficialResult>;
};

type Signer = (xml: string, pfx: Buffer, passphrase: string) => Promise<string>;

export interface SubmitNfseInput {
  tenantUserId: string;
  configId: string;
  invoiceId: string;
  numeroDps: string;
  serie: string;
  signedXml: string;
  /** Stable client-generated idempotency key, reused for retries. */
  idempotencyKey: string;
}

/**
 * Conservative orchestration: query first, never blindly resend after a timeout.
 * Authentication/tenant authorization must be completed by the calling route before invoking.
 * The caller must build and XML-sign using the official DPS XSD/DSig rules before passing signedXml.
 */
export async function submitNfseNational(
  input: SubmitNfseInput,
  transport: NfseTransport,
): Promise<NfseOfficialResult> {
  if (!input.tenantUserId || !input.configId || !input.invoiceId) throw new Error("Contexto fiscal incompleto.");
  if (!input.numeroDps.trim() || !input.serie.trim()) throw new Error("Número e série da DPS são obrigatórios.");
  if (!input.idempotencyKey.trim()) throw new Error("Chave de idempotência obrigatória.");
  if (!input.signedXml.includes("Signature")) throw new Error("XML DPS não aparenta conter assinatura XMLDSig.");

  const { data: invoice, error: loadError } = await (supabaseAdmin as any)
    .from("fiscal_invoices")
    .select("id,user_id,document_type,status,numero_dps,serie,idempotency_key,tentativas_envio")
    .eq("id", input.invoiceId)
    .eq("user_id", input.tenantUserId)
    .maybeSingle();

  if (loadError || !invoice) throw new Error("Nota fiscal não encontrada ou indisponível.");
  if (invoice.document_type !== "nfse") throw new Error("Este serviço aceita somente NFS-e.");
  if (invoice.status === "issued") {
    throw new Error("A NFS-e já consta como emitida; consulte os dados oficiais antes de qualquer ação.");
  }
  if (invoice.idempotency_key && invoice.idempotency_key !== input.idempotencyKey) {
    throw new Error("A chave de idempotência não corresponde à tentativa original.");
  }

  const { data: config, error: configError } = await (supabaseAdmin as any)
    .from("configuracoes_fiscais")
    .select("ambiente")
    .eq("id", input.configId)
    .eq("tenant_user_id", input.tenantUserId)
    .maybeSingle();
  if (configError || !config) throw new Error("Configuração fiscal não encontrada.");

  const { agent, baseUrl, destroy } = await createFiscalMtlsConnection(input.tenantUserId, input.configId);
  try {
    // Critical timeout/retry protection: ask the official service before attempting a POST.
    const existing = await transport.queryByDps({
      baseUrl, agent, numeroDps: input.numeroDps, serie: input.serie,
    });
    if (existing?.accepted) {
      await persistResult(input, existing, config.ambiente);
      return existing;
    }

    const { error: markError } = await (supabaseAdmin as any)
      .from("fiscal_invoices")
      .update({
        status: "queued",
        numero_dps: input.numeroDps,
        serie: input.serie,
        idempotency_key: input.idempotencyKey,
        ambiente_fiscal: config.ambiente,
        envio_iniciado_em: new Date().toISOString(),
        tentativas_envio: (invoice.tentativas_envio ?? 0) + 1,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", input.invoiceId)
      .eq("user_id", input.tenantUserId);
    if (markError) throw new Error("Não foi possível registrar a tentativa fiscal.");

    let result: NfseOfficialResult;
    try {
      result = await transport.submitSignedDps({ baseUrl, agent, signedXml: input.signedXml });
    } catch (err) {
      // Persist uncertain state. A later retry must queryByDps before sending again.
      await (supabaseAdmin as any).from("fiscal_invoices").update({
        status: "queued",
        motivo_rejeicao_texto: "Resultado incerto por falha de transporte; consultar DPS antes de retransmitir.",
        atualizado_em: new Date().toISOString(),
      }).eq("id", input.invoiceId).eq("user_id", input.tenantUserId);
      throw err;
    }
    await persistResult(input, result, config.ambiente);
    return result;
  } finally {
    destroy();
  }
}

async function persistResult(input: SubmitNfseInput, result: NfseOfficialResult, ambiente: string) {
  const accepted = result.accepted;
  const patch = {
    status: accepted ? "issued" : "rejected",
    chave_acesso: result.accessKey ?? null,
    access_key: result.accessKey ?? null,
    protocolo_autorizacao: result.protocol ?? null,
    codigo_status_sefaz: result.statusCode,
    motivo_rejeicao_texto: result.rejectionReason ?? null,
    provider_response: result.responseBody,
    issued_at: accepted ? new Date().toISOString() : null,
    ambiente_fiscal: ambiente,
    ultima_consulta_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  };
  const { error } = await (supabaseAdmin as any)
    .from("fiscal_invoices")
    .update(patch)
    .eq("id", input.invoiceId)
    .eq("user_id", input.tenantUserId);
  if (error) throw new Error("A resposta oficial foi recebida, mas não foi possível persistir o resultado fiscal.");
}
