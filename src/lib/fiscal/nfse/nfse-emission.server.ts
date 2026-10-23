import { createFiscalMtlsConnection } from "../security/mtls-agent.server";
import { decryptFiscalSecret, fiscalSecretAad } from "../security/crypto.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildDpsXml, type DpsBuilderInput } from "./dps-builder.server";
import { nfseDraftSchema } from "./draft-schema";
import { signDpsXml } from "./xml-signer.server";
import { queryDps, submitSignedDps, NfseTransportError } from "./nfse-national-client.server";
import { assertDpsRequiredGroups, assertFiscalRuntimeReady } from "./dps-xsd-validator.server";

export type NfseDraftMissingField = {
  field: string;
  label: string;
  message: string;
};

export type NfseDraftIncompleteResult = {
  ok: false;
  code: "DPS_INCOMPLETE";
  message: string;
  missingFields: NfseDraftMissingField[];
};

function incomplete(missingFields: NfseDraftMissingField[]): NfseDraftIncompleteResult {
  return {
    ok: false,
    code: "DPS_INCOMPLETE",
    message: "Preencha os campos fiscais indicados antes de emitir a NFS-e. Nenhum envio foi realizado.",
    missingFields,
  };
}

function normalizeRegime(value: string): { simplesNacional: 1 | 2 | 3 } | null {
  const regime = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["mei", "microempreendedorindividual"].includes(regime)) return { simplesNacional: 2 };
  if (["simplesnacional", "optantesimplesnacional", "simples"].includes(regime)) return { simplesNacional: 3 };
  if (["naooptante", "lucropresumido", "lucroreal", "regimenormal", "normal"].includes(regime)) {
    return { simplesNacional: 1 };
  }
  return null;
}

/**
 * Full server-side orchestration. The calling route MUST authenticate the session
 * and authorize access to tenantUserId/configId before calling this function.
 * The exact signed XML is checked against the configured official XSD before
 * any network transmission. Missing XSD/validator fails closed.
 */
export async function buildSignAndSubmitDps(input: {
  tenantUserId: string;
  configId: string;
  invoiceId: string;
  dps: DpsBuilderInput;
  timeoutMs?: number;
}) {
  // Load only the tenant configuration first so prerequisites can be checked against its actual SEFIN environment.
  const { data: config, error: configError } = await supabaseAdmin
    .from("configuracoes_fiscais")
    .select("id,tenant_user_id,certificado_ciphertext,certificado_nonce,certificado_auth_tag,senha_certificado_ciphertext,senha_certificado_nonce,senha_certificado_auth_tag,status,ambiente")
    .eq("id", input.configId)
    .eq("tenant_user_id", input.tenantUserId)
    .maybeSingle();

  if (configError || !config || config.status !== "ativo") {
    throw new Error("Configuração fiscal ou certificado ativo não encontrado.");
  }
  const fiscalEnvironment = config.ambiente === "producao" || config.ambiente === "producao_restrita"
    ? config.ambiente
    : null;
  if (!fiscalEnvironment) throw new Error("Ambiente fiscal inválido; emissão bloqueada.");
  assertFiscalRuntimeReady(fiscalEnvironment);

  const { data: invoice, error: invoiceError } = await supabaseAdmin
    .from("fiscal_invoices")
    .select("id,user_id,document_type,status,numero_dps,serie,tentativas_envio")
    .eq("id", input.invoiceId)
    .eq("user_id", input.tenantUserId)
    .maybeSingle();

  if (invoiceError || !invoice || invoice.document_type !== "nfse") {
    throw new Error("Rascunho de NFS-e não encontrado.");
  }
  if (invoice.status === "issued") throw new Error("Esta NFS-e já está marcada como emitida.");

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
  const passphrase = password.toString("utf8");
  password.fill(0);

  let signedXml: string;
  try {
    const built = buildDpsXml(input.dps);
    signedXml = await signDpsXml(built.xml, pfx, passphrase);
    // Validate the exact signed XML that will be transmitted, not only the unsigned payload.
    assertDpsRequiredGroups(signedXml, fiscalEnvironment);
  } finally {
    pfx.fill(0);
  }

  const connection = await createFiscalMtlsConnection(input.tenantUserId, input.configId);
  const builtId = buildDpsXml(input.dps).id;

  try {
    let existing;
    try {
      existing = await queryDps({
        baseUrl: connection.baseUrl,
        agent: connection.agent,
        dpsId: builtId,
        timeoutMs: input.timeoutMs,
      });
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
    if (existing) {
      throw new Error("Consulta da DPS retornou estado não conclusivo; não retransmitir automaticamente.");
    }

    const { error: updateError } = await supabaseAdmin.from("fiscal_invoices").update({
      status: "queued",
      numero_dps: String(input.dps.numeroDps),
      serie: String(input.dps.serie),
      ambiente_fiscal: config.ambiente,
      envio_iniciado_em: new Date().toISOString(),
      tentativas_envio: (invoice.tentativas_envio ?? 0) + 1,
      atualizado_em: new Date().toISOString(),
    }).eq("id", input.invoiceId).eq("user_id", input.tenantUserId);

    if (updateError) throw new Error("Não foi possível registrar a tentativa de emissão.");

    try {
      const result = await submitSignedDps({
        baseUrl: connection.baseUrl,
        agent: connection.agent,
        signedXml,
        timeoutMs: input.timeoutMs,
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
  await supabaseAdmin.from("fiscal_invoices").update({
    status: "queued",
    motivo_rejeicao_texto: "Resultado incerto; consultar DPS antes de retransmitir.",
    atualizado_em: new Date().toISOString(),
  }).eq("id", invoiceId).eq("user_id", tenantUserId);
}

async function saveResult(input: { invoiceId: string; tenantUserId: string }, result: {
  accepted: boolean;
  accessKey?: string;
  protocol?: string;
  statusCode: string;
  rejectionReason?: string;
  responseBody: unknown;
}, ambiente: string) {
  const confirmed = result.accepted && Boolean(result.accessKey);
  const { error } = await supabaseAdmin.from("fiscal_invoices").update({
    status: confirmed ? "issued" : "rejected",
    chave_acesso: result.accessKey ?? null,
    access_key: result.accessKey ?? null,
    protocolo_autorizacao: result.protocol ?? null,
    codigo_status_sefaz: result.statusCode,
    motivo_rejeicao_texto: result.rejectionReason ?? null,
    provider_response: result.responseBody as import("@/integrations/supabase/types").Json,
    issued_at: confirmed ? new Date().toISOString() : null,
    ambiente_fiscal: ambiente,
    ultima_consulta_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  }).eq("id", input.invoiceId).eq("user_id", input.tenantUserId);

  if (error) throw new Error("Resposta recebida, mas falhou a persistência do resultado fiscal.");
}

/**
 * Loads and validates the persisted draft, checks that the database-assigned DPS
 * sequence exists, maps only taxpayer-provided/configured values, then enters the
 * signing/XSD/mTLS pipeline. It never guesses the service municipality or tax regime.
 */
export async function emitNfseForTenant(input: {
  invoiceId: string;
  tenantUserId: string;
  configId: string;
}): Promise<Awaited<ReturnType<typeof buildSignAndSubmitDps>> | NfseDraftIncompleteResult> {
  const { data: config, error: configError } = await supabaseAdmin
    .from("configuracoes_fiscais")
    .select("id,tenant_user_id,status,cnpj,inscricao_municipal,municipio_ibge,regime_tributario,ambiente")
    .eq("id", input.configId)
    .eq("tenant_user_id", input.tenantUserId)
    .maybeSingle();

  if (configError || !config || config.status !== "ativo") {
    throw new Error("Configuração fiscal ativa não encontrada.");
  }

  const { data: invoice, error: invoiceError } = await supabaseAdmin
    .from("fiscal_invoices")
    .select("id,user_id,document_type,status,issuer_name,issuer_cnpj,issuer_city_ibge,recipient_name,recipient_tax_id,service_description,amount_cents,competencia,codigo_trib_nacional,cnae,iss_retido,aliquota_iss,municipio_prestacao_ibge,serie,numero_dps")
    .eq("id", input.invoiceId)
    .eq("user_id", input.tenantUserId)
    .maybeSingle();

  if (invoiceError || !invoice || invoice.document_type !== "nfse") {
    throw new Error("Rascunho de NFS-e não encontrado.");
  }
  if (invoice.status === "issued") throw new Error("Esta NFS-e já está marcada como emitida.");

  const validatedDraft = nfseDraftSchema.safeParse({
    user_id: invoice.user_id,
    issuer_name: invoice.issuer_name,
    issuer_cnpj: invoice.issuer_cnpj,
    issuer_city_ibge: invoice.issuer_city_ibge,
    recipient_name: invoice.recipient_name,
    recipient_tax_id: invoice.recipient_tax_id,
    service_description: invoice.service_description,
    amount_cents: Number(invoice.amount_cents),
    competencia: invoice.competencia,
    codigo_trib_nacional: invoice.codigo_trib_nacional,
    cnae: invoice.cnae,
    iss_retido: invoice.iss_retido,
    aliquota_iss: invoice.aliquota_iss === null ? null : Number(invoice.aliquota_iss),
  });

  const missingFields: NfseDraftMissingField[] = [];
  if (!validatedDraft.success) {
    for (const issue of validatedDraft.error.issues) {
      const field = issue.path.join(".") || "rascunho";
      if (!missingFields.some((item) => item.field === field)) {
        missingFields.push({ field, label: fieldLabel(field), message: issue.message });
      }
    }
  }

  const regime = normalizeRegime(config.regime_tributario);
  if (!config.cnpj || !/^\d{14}$/.test(config.cnpj.replace(/\D/g, ""))) {
    missingFields.push({ field: "configuracoes_fiscais.cnpj", label: "CNPJ do prestador", message: "Informe um CNPJ válido na configuração fiscal ativa." });
  }
  if (!config.municipio_ibge || !/^\d{7}$/.test(config.municipio_ibge.replace(/\D/g, ""))) {
    missingFields.push({ field: "configuracoes_fiscais.municipio_ibge", label: "Município do prestador", message: "Informe o código IBGE de 7 dígitos na configuração fiscal." });
  }
  if (!regime) {
    missingFields.push({ field: "configuracoes_fiscais.regime_tributario", label: "Regime tributário do prestador", message: "Selecione um regime tributário reconhecido (MEI, Simples Nacional ou não optante)." });
  }
  if (!invoice.serie || !/^\d{1,5}$/.test(String(invoice.serie))) {
    missingFields.push({ field: "serie", label: "Série da DPS", message: "A série deve ser atribuída ao gravar o rascunho." });
  }
  if (invoice.numero_dps === null || invoice.numero_dps === undefined || !/^\d{1,15}$/.test(String(invoice.numero_dps)) || Number(invoice.numero_dps) < 1) {
    missingFields.push({ field: "numero_dps", label: "Número da DPS", message: "Não há número sequencial atribuído. Verifique se a migração e o gatilho de sequenciamento da DPS foram aplicados e grave novamente o rascunho." });
  }

  // cLocPrestacao is stored separately; never infer it from the issuer municipality.
  if (!invoice.municipio_prestacao_ibge || !/^\d{7}$/.test(invoice.municipio_prestacao_ibge)) {
    missingFields.push({
      field: "municipio_prestacao_ibge",
      label: "Município da prestação do serviço",
      message: "Informe o código IBGE de 7 dígitos do município onde o serviço foi prestado.",
    });
  }

  if (validatedDraft.success && config.cnpj && config.municipio_ibge) {
    const issuerCnpj = validatedDraft.data.issuer_cnpj;
    if (issuerCnpj !== config.cnpj.replace(/\D/g, "")) {
      missingFields.push({ field: "issuer_cnpj", label: "CNPJ do prestador", message: "O CNPJ do rascunho não corresponde ao CNPJ da configuração fiscal ativa." });
    }
    if (validatedDraft.data.issuer_city_ibge !== config.municipio_ibge.replace(/\D/g, "")) {
      missingFields.push({ field: "issuer_city_ibge", label: "Município do prestador", message: "O município do rascunho não corresponde ao município da configuração fiscal ativa." });
    }
  }

  if (missingFields.length > 0 || !validatedDraft.success || !regime) {
    return incomplete(missingFields);
  }

  const draft = validatedDraft.data;
  const recipientTaxId = draft.recipient_tax_id;
  const dps: DpsBuilderInput = {
    ambiente: config.ambiente === "producao" ? 1 : 2,
    dataHoraEmissao: new Date().toISOString(),
    versaoAplicacao: "CriticalCash/1.0",
    serie: String(invoice.serie),
    numeroDps: String(invoice.numero_dps),
    competencia: draft.competencia,
    tipoEmitente: 1,
    municipioEmissorIbge: config.municipio_ibge.replace(/\D/g, ""),
    prestador: {
      cnpj: config.cnpj.replace(/\D/g, ""),
      inscricaoMunicipal: config.inscricao_municipal ?? undefined,
      simplesNacional: regime.simplesNacional,
    },
    tomador: {
      ...(recipientTaxId.length === 11 ? { cpf: recipientTaxId } : { cnpj: recipientTaxId }),
      nome: draft.recipient_name,
    },
    servico: {
      // This value must be supplied explicitly; do not infer from issuer location.
      municipioPrestacaoIbge: invoice.municipio_prestacao_ibge!,
      codigoTributacaoNacional: draft.codigo_trib_nacional,
      cnae: draft.cnae,
      descricao: draft.service_description,
      valorServicos: draft.amount_cents / 100,
      issRetido: draft.iss_retido,
      ...(draft.aliquota_iss !== null && draft.aliquota_iss !== undefined
        ? { aliquotaIss: draft.aliquota_iss }
        : {}),
    },
  };

  return await buildSignAndSubmitDps({
    invoiceId: input.invoiceId,
    tenantUserId: input.tenantUserId,
    configId: input.configId,
    dps,
  });
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    user_id: "Titular do rascunho",
    issuer_name: "Nome do prestador",
    issuer_cnpj: "CNPJ do prestador",
    issuer_city_ibge: "Município do prestador",
    recipient_name: "Nome do tomador",
    recipient_tax_id: "CPF/CNPJ do tomador",
    service_description: "Descrição do serviço",
    amount_cents: "Valor do serviço",
    competencia: "Competência",
    codigo_trib_nacional: "Código de Tributação Nacional",
    cnae: "CNAE",
    iss_retido: "Retenção do ISS",
    aliquota_iss: "Alíquota do ISS",
  };
  return labels[field] ?? field;
}
