import { describe, expect, it } from "vitest";
import { signDpsXml } from "./xml-signer.server";

describe("DPS XML signer identifier guard", () => {
  it("accepts the official DPS-prefixed Id before attempting certificate extraction", async () => {
    const id = `DPS${"0".repeat(42)}`;
    const xml = `<DPS><infDPS Id="${id}"></infDPS></DPS>`;

    await expect(signDpsXml(xml, Buffer.from("not-a-real-pkcs12"), "test-password"))
      .rejects.toThrow("Não foi possível abrir o certificado A1");
  });

  it("rejects an obsolete generic ID prefix", async () => {
    const xml = `<DPS><infDPS Id="ID${"0".repeat(42)}"></infDPS></DPS>`;

    await expect(signDpsXml(xml, Buffer.from("not-a-real-pkcs12"), "test-password"))
      .rejects.toThrow("XML DPS inválido");
  });
});
