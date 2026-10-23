import { Agent } from "node:https";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptFiscalSecret, fiscalSecretAad } from "./crypto.server";

type FiscalConfigRow = {
  id: string;
  tenant_user_id: string;
  ambiente: "producao_restrita" | "producao";
  status: "pendente" | "ativo" | "expirado" | "invalido" | "revogado";
  certificado_ciphertext: string;
  certificado_nonce: string;
  certificado_auth_tag: string;
  senha_certificado_ciphertext: string;
  senha_certificado_nonce: string;
  senha_certificado_auth_tag: string;
};

const SEFIN_BASE_URLS = {
  producao_restrita: "https://sefin.producaorestrita.nfse.gov.br",
  producao: "https://sefin.nfse.gov.br",
} as const;

export type FiscalMtlsConnection = {
  agent: Agent;
  baseUrl: string;
  destroy: () => void;
};

/**
 * Call only after authenticating the caller and authorizing access to the tenant.
 * The URL comes from a fixed allowlist, never from user input.
 */
export async function createFiscalMtlsConnection(
  tenantUserId: string,
  configId: string,
): Promise<FiscalMtlsConnection> {
  const { data, error } = await (supabaseAdmin as any)
    .from("configuracoes_fiscais")
    .select([
      "id", "tenant_user_id", "ambiente", "status",
      "certificado_ciphertext", "certificado_nonce", "certificado_auth_tag",
      "senha_certificado_ciphertext", "senha_certificado_nonce", "senha_certificado_auth_tag",
    ].join(","))
    .eq("id", configId)
    .eq("tenant_user_id", tenantUserId)
    .maybeSingle();

  if (error) throw new Error("Não foi possível carregar a configuração fiscal.");
  if (!data) throw new Error("Configuração fiscal não encontrada para esta empresa.");
  const config = data as FiscalConfigRow;
  if (config.status !== "ativo") throw new Error("O certificado fiscal não está ativo.");

  const pfx = decryptFiscalSecret(
    {
      ciphertext: config.certificado_ciphertext,
      nonce: config.certificado_nonce,
      authTag: config.certificado_auth_tag,
    },
    fiscalSecretAad(tenantUserId, configId, "certificado"),
  );
  const passwordBuffer = decryptFiscalSecret(
    {
      ciphertext: config.senha_certificado_ciphertext,
      nonce: config.senha_certificado_nonce,
      authTag: config.senha_certificado_auth_tag,
    },
    fiscalSecretAad(tenantUserId, configId, "senha_certificado"),
  );
  const passphrase = passwordBuffer.toString("utf8");
  passwordBuffer.fill(0);

  try {
    const agent = new Agent({
      pfx,
      passphrase,
      keepAlive: true,
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    });
    return {
      agent,
      baseUrl: SEFIN_BASE_URLS[config.ambiente],
      destroy: () => {
        agent.destroy();
        pfx.fill(0);
      },
    };
  } catch (error) {
    pfx.fill(0);
    throw error;
  }
}
