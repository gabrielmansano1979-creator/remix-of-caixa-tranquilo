import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptFiscalSecret, fiscalSecretAad } from "../security/crypto.server";
import { signDpsXml } from "./xml-signature.server";
import { submitSignedDps, type DpsSubmissionResult } from "./dps-submission.server";

/**
 * End-to-end server-only orchestration: retrieve a tenant-owned active PFX,
 * sign the DPS, and submit it over the mTLS connection. Authenticate the caller
 * and authorize tenant ownership before invoking this function.
 */
export async function signAndSubmitDps(input: {
  tenantUserId: string;
  fiscalConfigId: string;
  dpsXml: string;
}): Promise<DpsSubmissionResult> {
  const { data, error } = await (supabaseAdmin as any)
    .from("configuracoes_fiscais")
    .select([
      "id", "tenant_user_id", "status",
      "certificado_ciphertext", "certificado_nonce", "certificado_auth_tag",
      "senha_certificado_ciphertext", "senha_certificado_nonce", "senha_certificado_auth_tag",
    ].join(","))
    .eq("id", input.fiscalConfigId)
    .eq("tenant_user_id", input.tenantUserId)
    .maybeSingle();

  if (error) throw new Error("Não foi possível carregar a configuração fiscal.");
  if (!data) throw new Error("Configuração fiscal não encontrada para esta empresa.");
  if (data.status !== "ativo") throw new Error("O certificado fiscal não está ativo.");

  const pfx = decryptFiscalSecret(
    {
      ciphertext: data.certificado_ciphertext,
      nonce: data.certificado_nonce,
      authTag: data.certificado_auth_tag,
    },
    fiscalSecretAad(input.tenantUserId, input.fiscalConfigId, "certificado"),
  );
  const passwordBuffer = decryptFiscalSecret(
    {
      ciphertext: data.senha_certificado_ciphertext,
      nonce: data.senha_certificado_nonce,
      authTag: data.senha_certificado_auth_tag,
    },
    fiscalSecretAad(input.tenantUserId, input.fiscalConfigId, "senha_certificado"),
  );

  try {
    const signedDpsXml = await signDpsXml(
      input.dpsXml,
      pfx,
      passwordBuffer.toString("utf8"),
    );
    return await submitSignedDps({
      tenantUserId: input.tenantUserId,
      fiscalConfigId: input.fiscalConfigId,
      signedDpsXml,
    });
  } finally {
    pfx.fill(0);
    passwordBuffer.fill(0);
  }
}
