import { createFiscalMtlsConnection } from "../security/mtls-agent.server";
import { decryptFiscalSecret, fiscalSecretAad } from "../security/crypto.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildDpsXml, type DpsBuilderInput } from "./dps-builder.server";
import { signDpsXml } from "./xml-signer.server";
import { queryDps, submitSignedDps, NfseTransportError } from "./nfse-national-client.server";

/**
 * Full server-side orchestration. The calling route MUST authenticate the session
 * and authorize access to tenantUserId/configId before calling this function.
 * The DPS must still pass official XSD validation before production use.
 */
export async function buildSignAndSubmitDps(input: {
  tenantUserId: string;
  configId: string;
  invoiceId: string;
  dps: DpsBuilderInput;
  timeoutMs?: number;
}) {
  const { data: config, error: configError } = await (supabaseAdmin as any)
    .from("configuracoes_fiscais")
    .select("id,tenant_user_id,certificado_ciphertext,certificado_nonce,certificado_auth_tag,senha_certificado_ciphertext,senha_certificado_nonce,senha_certificado_auth_tag,status,ambiente")
    .eq("id", input.configId).eq("tenant_user_id", input.tenantUserId).maybeSingle();
  if (configError || !config || config.status !== "ativo") throw new Error("Configuração fiscal ou certificado ativo não encontrado.");

  const { data: invoice, error: invoiceError } = await (supabaseAdmin as any)
    .from("fiscal_invoices").select("id,user_id,document_type,status,numero_dps,serie,tentativas_envio")
    .eq("id", input.invoiceId).eq("user_id", input.tenantUserId).maybeSingle();
  if (invoiceError || !invoice || invoice.document_type !== "nfse") throw new Error("Rascunho de NFS-e não encontrado.");
  if (invoice.status === "issued") throw new Error("Esta NFS-e já está marcada como emitida.");

  const pfx = decryptFiscalSecret({
    ciphertext: config.certificado_ciphertext, nonce: config.certificado_nonce, authTag: config.certificado_auth_tag,
  }, fiscalSecretAad(input.tenantUserId, input.configId, "certificado"));
  const password = decryptFiscalSecret({
    ciphertext: config.senha_certificado_ciphertext, nonce: config.senha_certificado_nonce, authTag: config.senha_certificado_auth_tag,
  }, fiscalSecretAad(input.tenantUserId, input.configId, "senha_certificado"));
  const passphrase = password.toString("utf8");
  password.fill(0);

  let signedXml: string;
  try {
    const built = buildDpsXml(input.dps);
    signedXml = await signDpsXml(built.xml, pfx, passphrase);
  } finally {
    pfx.fill(0);
  }

  const connection = await createFiscalMtlsConnection(input.tenantUserId, input.configId);
  // Official DPS ID composition used by the existing client: ID + 42 numeric characters.
  const builtId = "ID" + input.dps.municipioEmissorIbge.replace(/\D/g, "") + "2" +
    input.dps.prestador.cnpj.replace(/\D/g, "") + String(input.dps.serie).padStart(5, "0") +
    String(input.dps.numeroDps).padStart(15, "0");
  try {
    let existing;
    try {
      existing = await queryDps({ baseUrl: connection.baseUrl, agent: connection.agent, dpsId: builtId, timeoutMs: input.timeoutMs });
    } catch (error) {
      if (error instanceof NfseTransportError && error.uncertainOutcome) {
        await markUncertain(input.invoiceId, input.tenantUserId);
      }
      throw error;
    }
    if (existing?.accepted && existing.accessKey) {
      await saveResult(input, existing, config.ambiente);
      return existing;
    }
    if (existing) throw new Error("Consulta da DPS retornou estado não conclusivo; não retransmitir automaticamente.");

    const { error: updateError } = await (supabaseAdmin as any).from("fiscal_invoices").update({
      status: "queued", numero_dps: String(input.dps.numeroDps), serie: String(input.dps.serie),
      ambiente_fiscal: config.ambiente, envio_iniciado_em: new Date().toISOString(),
      tentativas_envio: (invoice.tentativas_envio ?? 0) + 1, atualizado_em: new Date().toISOString(),
    }).eq("id", input.invoiceId).eq("user_id", input.tenantUserId);
    if (updateError) throw new Error("Não foi possível registrar a tentativa de emissão.");

    try {
      const result = await submitSignedDps({
        baseUrl: connection.baseUrl, agent: connection.agent, signedXml, timeoutMs: input.timeoutMs,
      });
      await saveResult(input, result, config.ambiente);
      return result;
    } catch (error) {
      await markUncertain(input.invoiceId, input.tenantUserId);
      throw error;
    }
  } finally {
    connection.destroy();
  }
}

async function markUncertain(invoiceId: string, tenantUserId: string) {
  await (supabaseAdmin as any).from("fiscal_invoices").update({
    status: "queued",
    motivo_rejeicao_texto: "Resultado incerto; consultar DPS antes de retransmitir.",
    atualizado_em: new Date().toISOString(),
  }).eq("id", invoiceId).eq("user_id", tenantUserId);
}
async function saveResult(input: { invoiceId: string; tenantUserId: string }, result: {
  accepted: boolean; accessKey?: string; protocol?: string; statusCode: string; rejectionReason?: string; responseBody: unknown;
}, ambiente: string) {
  const confirmed = result.accepted && Boolean(result.accessKey);
  const { error } = await (supabaseAdmin as any).from("fiscal_invoices").update({
    status: confirmed ? "issued" : "rejected",
    chave_acesso: result.accessKey ?? null,
    access_key: result.accessKey ?? null,
    protocolo_autorizacao: result.protocol ?? null,
    codigo_status_sefaz: result.statusCode,
    motivo_rejeicao_texto: result.rejectionReason ?? null,
    provider_response: result.responseBody,
    issued_at: confirmed ? new Date().toISOString() : null,
    ambiente_fiscal: ambiente,
    ultima_consulta_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  }).eq("id", input.invoiceId).eq("user_id", input.tenantUserId);
  if (error) throw new Error("Resposta recebida, mas falhou a persistência do resultado fiscal.");
}
