import { describe, expect, it } from "vitest";
import { signDpsXml } from "./xml-signer.server";

describe("DPS XML signer identifier guard", () => {
  it("accepts the national ID + 42-digit identifier generated for infDPS", async () => {
    const id = `ID${"0".repeat(42)}`;
    const xml = `<DPS><infDPS Id="${id}"></infDPS></DPS>`;

    await expect(signDpsXml(xml, Buffer.from("not-a-real-pkcs12"), "test-password"))
      .rejects.toThrow("Não foi possível abrir o certificado A1");
  });

  it("rejects the unsupported DPS prefix", async () => {
    const xml = `<DPS><infDPS Id="DPS${"0".repeat(42)}"></infDPS></DPS>`;

    await expect(signDpsXml(xml, Buffer.from("not-a-real-pkcs12"), "test-password"))
      .rejects.toThrow("XML DPS inválido");
  });

  it("rejects an ID with the wrong digit count", async () => {
    const xml = `<DPS><infDPS Id="ID${"0".repeat(41)}"></infDPS></DPS>`;

    await expect(signDpsXml(xml, Buffer.from("not-a-real-pkcs12"), "test-password"))
      .rejects.toThrow("XML DPS inválido");
  });
});
