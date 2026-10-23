import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptFiscalSecret, fiscalSecretAad } from "../security/crypto.server";
import { buildDpsXml, type DpsBuilderInput } from "./dps-builder.server";
import { signDpsXml } from "./xml-signer.server";
import { queryDps, submitSignedDps } from "./nfse-national-client.server";
import { submitNfseNational, type NfseOfficialResult } from "./nfse-submission.server";
import { assertDpsRequiredGroups, assertFiscalRuntimeReady } from "./dps-xsd-validator.server";

export interface IssueNfseInput {
  tenantUserId: string;
  configId: string;
  invoiceId: string;
  idempotencyKey: string;
  dps: DpsBuilderInput;
}

/**
 * Server-only issuance entry point. The caller must authenticate the session and
 * authorize the caller against tenantUserId before calling this function.
 */
export async function issueNfseNational(input: IssueNfseInput): Promise<NfseOfficialResult> {
  // Fail closed before reading secrets or opening any fiscal network connection.
  assertFiscalRuntimeReady();
  const { data: config, error } = await (supabaseAdmin as any)
    .from("configuracoes_fiscais")
    .select([
      "id", "tenant_user_id", "certificado_ciphertext", "certificado_nonce", "certificado_auth_tag",
      "senha_certificado_ciphertext", "senha_certificado_nonce", "senha_certificado_auth_tag",
      "status", "cnpj", "municipio_ibge", "ambiente",
    ].join(","))
    .eq("id", input.configId)
    .eq("tenant_user_id", input.tenantUserId)
    .maybeSingle();

  if (error || !config) throw new Error("Configuração fiscal não encontrada.");
  if (config.status !== "ativo") throw new Error("O certificado fiscal não está ativo.");
  const fiscalEnvironment = config.ambiente === "producao" || config.ambiente === "producao_restrita"
    ? config.ambiente
    : null;
  if (!fiscalEnvironment) throw new Error("Ambiente fiscal inválido; emissão bloqueada.");
  assertFiscalRuntimeReady(fiscalEnvironment);
  if (config.cnpj && config.cnpj.replace(/\D/g, "") !== input.dps.prestador.cnpj.replace(/\D/g, "")) {
    throw new Error("O CNPJ do prestador não corresponde à configuração fiscal selecionada.");
  }
  if (config.municipio_ibge && config.municipio_ibge !== input.dps.municipioEmissorIbge) {
    throw new Error("O município emissor da DPS não corresponde à configuração fiscal selecionada.");
  }

  const pfx = decryptFiscalSecret({
    ciphertext: config.certificado_ciphertext,
    nonce: config.certificado_nonce,
    authTag: config.certificado_auth_tag,
  }, fiscalSecretAad(input.tenantUserId, input.configId, "certificado"));
  const password = decryptFiscalSecret({
    ciphertext: config.senha_certificado_ciphertext,
    nonce: config.senha_certificado_nonce,
    authTag: config.senha_certificado_auth_tag,
  }, fiscalSecretAad(input.tenantUserId, input.configId, "senha_certificado"));

  let signedXml: string;
  try {
    const { xml, id } = buildDpsXml(input.dps);
    signedXml = await signDpsXml(xml, pfx, password.toString("utf8"));
    // Validate the exact signed XML before it can reach the SEFIN submission helper.
    assertDpsRequiredGroups(signedXml, fiscalEnvironment);
    const numeroDps = String(input.dps.numeroDps);
    const serie = String(input.dps.serie);
    return await submitNfseNational({
      tenantUserId: input.tenantUserId,
      configId: input.configId,
      invoiceId: input.invoiceId,
      numeroDps,
      serie,
      signedXml,
      idempotencyKey: input.idempotencyKey,
    }, {
      queryByDps: async ({ baseUrl, agent }) => queryDps({ baseUrl, agent, dpsId: id }),
      submitSignedDps: async ({ baseUrl, agent, signedXml: xmlToSend }) =>
        submitSignedDps({ baseUrl, agent, signedXml: xmlToSend }),
    });
  } finally {
    pfx.fill(0);
    password.fill(0);
  }
}
