import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

export type EncryptedSecret = {
  ciphertext: string;
  nonce: string;
  authTag: string;
  keyVersion: number;
};

function encryptionKey(): Buffer {
  const encoded = process.env.FISCAL_ENCRYPTION_KEY;
  if (!encoded) throw new Error("FISCAL_ENCRYPTION_KEY não configurada no servidor.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== KEY_BYTES || key.toString("base64") !== encoded) {
    key.fill(0);
    throw new Error("FISCAL_ENCRYPTION_KEY deve ser Base64 canônica que representa exatamente 32 bytes.");
  }
  return key;
}

export function encryptFiscalSecret(
  value: Buffer | string,
  associatedData: string,
  keyVersion = 1,
): EncryptedSecret {
  const key = encryptionKey();
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: AUTH_TAG_BYTES });
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const plaintext = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");

  try {
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
      ciphertext: ciphertext.toString("base64"),
      nonce: nonce.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      keyVersion,
    };
  } finally {
    key.fill(0);
    if (!Buffer.isBuffer(value)) plaintext.fill(0);
  }
}

export function decryptFiscalSecret(
  encrypted: Pick<EncryptedSecret, "ciphertext" | "nonce" | "authTag">,
  associatedData: string,
): Buffer {
  const key = encryptionKey();
  const nonce = Buffer.from(encrypted.nonce, "base64");
  const authTag = Buffer.from(encrypted.authTag, "base64");

  if (nonce.length !== NONCE_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    key.fill(0);
    throw new Error("Formato de segredo fiscal criptografado inválido.");
  }

  const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: AUTH_TAG_BYTES });
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
      decipher.final(),
    ]);
  } catch {
    throw new Error("Não foi possível autenticar/descriptografar o segredo fiscal. Verifique a chave e o contexto.");
  } finally {
    key.fill(0);
  }
}

export function fiscalSecretAad(
  tenantUserId: string,
  configId: string,
  field: "certificado" | "senha_certificado",
) {
  return `critical-cash:fiscal:v1:${tenantUserId}:${configId}:${field}`;
}
