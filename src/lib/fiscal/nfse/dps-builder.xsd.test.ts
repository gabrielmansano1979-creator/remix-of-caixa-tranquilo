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

    const { xml, id } = buildDpsXml({
      ambiente: 2,
      dataHoraEmissao: "2026-10-23T18:00:00-03:00",
      versaoAplicacao: "CriticalCash/1.0",
      serie: 1,
      numeroDps: 1,
      competencia: "2026-10-23",
      tipoEmitente: 1,
      municipioEmissorIbge: "3550308",
      prestador: {
        cnpj: "12345678000195",
        simplesNacional: 3,
        regimeEspecialTributacao: 0,
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
    });
    expect(id).toMatch(/^DPS\d{42}$/);

    try {
      const production = assertDpsRequiredGroups(xml, "producao");
      expect(production.valid).toBe(true);
      expect(production.compatibility).toBe("normalized-xsd-pattern-anchors");

      const restricted = assertDpsRequiredGroups(xml, "producao_restrita");
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
