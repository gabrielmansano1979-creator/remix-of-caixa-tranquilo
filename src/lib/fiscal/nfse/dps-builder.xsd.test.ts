import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDpsXml } from "./dps-builder.server";

describe("DPS XML official XSD", () => {
  it("builds a DPS that validates against the pinned official production-restrita XSD", () => {
    const schemaCandidates = [
      resolve(process.cwd(), "supabase/schemas/nfse/DPS_v1.01.xsd"),
      resolve(process.cwd(), "supabase/schemas/nfse/producao-restrita-20261020/DPS_v1.01.xsd"),
    ];
    const schemaPath = schemaCandidates.find(existsSync);
    expect(schemaPath, "official DPS XSD must be present in the repository").toBeTruthy();

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

    const directory = mkdtempSync(join(tmpdir(), "critical-cash-xsd-test-"));
    const xmlPath = join(directory, "dps.xml");
    try {
      writeFileSync(xmlPath, xml, { encoding: "utf8", mode: 0o600 });
      expect(() => execFileSync("xmllint", [
        "--nonet", "--noout", "--schema", schemaPath!, xmlPath,
      ], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"] })).not.toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
