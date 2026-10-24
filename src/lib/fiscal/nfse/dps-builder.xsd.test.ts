import { describe, expect, it } from "vitest";
import { buildDpsXml } from "./dps-builder.server";
import { assertDpsRequiredGroups } from "./dps-xsd-validator.server";

describe("DPS XML official XSD", () => {
  it("validates the generated DPS against the pinned production and production-restrita schemas", () => {
    const previousKey = process.env.FISCAL_ENCRYPTION_KEY;
    const previousXmllint = process.env.NFSE_XMLLINT_BIN;
    // Synthetic key only: this test validates XML and never decrypts or transmits a certificate.
    process.env.FISCAL_ENCRYPTION_KEY = Buffer.alloc(32, 0x5a).toString("base64");
    process.env.NFSE_XMLLINT_BIN = "xmllint";

    const commonInput = {
      dataHoraEmissao: "2026-10-23T18:00:00-03:00",
      versaoAplicacao: "CriticalCash/1.0",
      serie: 1,
      numeroDps: 1,
      competencia: "2026-10-23",
      tipoEmitente: 1 as const,
      municipioEmissorIbge: "3550308",
      prestador: {
        cnpj: "12345678000195",
        simplesNacional: 3 as const,
        regimeEspecialTributacao: 0 as const,
      },
      tomador: { cpf: "52998224725", nome: "Tomador de teste XSD" },
      servico: {
        municipioPrestacaoIbge: "3550308",
        codigoTributacaoNacional: "010101",
        cnae: "6201501",
        descricao: "Documento ficticio para validacao automatizada do XSD; nao transmitir.",
        valorServicos: 100,
        issRetido: false,
        aliquotaIss: 2,
      },
    };
    const productionDps = buildDpsXml({ ...commonInput, ambiente: 1 });
    const restrictedDps = buildDpsXml({ ...commonInput, ambiente: 2 });
    expect(productionDps.id).toMatch(/^DPS\\d{42}$/);
    expect(restrictedDps.id).toBe(productionDps.id);

    try {
      const production = assertDpsRequiredGroups(productionDps.xml, "producao");
      expect(production.valid).toBe(true);
      expect(production.compatibility).toBe("normalized-xsd-pattern-anchors");

      const restricted = assertDpsRequiredGroups(restrictedDps.xml, "producao_restrita");
      expect(restricted.valid).toBe(true);
      expect(restricted.compatibility).toBe("none");
    } finally {
      if (previousKey === undefined) delete process.env.FISCAL_ENCRYPTION_KEY;
      else process.env.FISCAL_ENCRYPTION_KEY = previousKey;
      if (previousXmllint === undefined) delete process.env.NFSE_XMLLINT_BIN;
      else process.env.NFSE_XMLLINT_BIN = previousXmllint;
    }
  });
});
