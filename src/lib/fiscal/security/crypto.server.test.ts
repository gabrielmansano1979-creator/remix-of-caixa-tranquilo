import { afterEach, describe, expect, it } from "vitest";
import { decryptFiscalSecret, encryptFiscalSecret } from "./crypto.server";

const originalKey = process.env.FISCAL_ENCRYPTION_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.FISCAL_ENCRYPTION_KEY;
  else process.env.FISCAL_ENCRYPTION_KEY = originalKey;
});

describe("fiscal secret encryption", () => {
  it("encrypts and decrypts with AES-256-GCM and the same associated data", () => {
    process.env.FISCAL_ENCRYPTION_KEY = Buffer.alloc(32, 0x5a).toString("base64");
    const plaintext = Buffer.from("synthetic test certificate password", "utf8");
    const associatedData = "critical-cash:fiscal:v1:tenant:config:senha_certificado";
    const encrypted = encryptFiscalSecret(plaintext, associatedData);
    const decrypted = decryptFiscalSecret(encrypted, associatedData);
    try {
      expect(decrypted.toString("utf8")).toBe("synthetic test certificate password");
      expect(encrypted.nonce).not.toBe("");
      expect(encrypted.authTag).not.toBe("");
    } finally {
      decrypted.fill(0);
      plaintext.fill(0);
    }
  });

  it("rejects a secret when the associated data does not match", () => {
    process.env.FISCAL_ENCRYPTION_KEY = Buffer.alloc(32, 0x5a).toString("base64");
    const encrypted = encryptFiscalSecret("synthetic secret", "tenant-a:config-a");
    expect(() => decryptFiscalSecret(encrypted, "tenant-b:config-a")).toThrow(
      "Não foi possível autenticar/descriptografar o segredo fiscal.",
    );
  });

  it("rejects non-canonical Base64 encryption keys", () => {
    const canonical = Buffer.alloc(32, 0x5a).toString("base64");
    const finalDataCharacter = canonical.length - 2;
    const replacement = canonical[finalDataCharacter] === "A" ? "B" : "A";
    process.env.FISCAL_ENCRYPTION_KEY = canonical.slice(0, finalDataCharacter) + replacement + "=";
    expect(() => encryptFiscalSecret("synthetic secret", "tenant:config")).toThrow(
      "FISCAL_ENCRYPTION_KEY deve ser Base64 canônica",
    );
  });
});
