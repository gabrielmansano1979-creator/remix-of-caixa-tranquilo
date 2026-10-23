import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

function fail(message) {
  console.error(`[fiscal-runtime] ERRO: ${message}`);
  process.exitCode = 1;
}

const encodedKey = process.env.FISCAL_ENCRYPTION_KEY;
if (!encodedKey) {
  fail("FISCAL_ENCRYPTION_KEY ausente.");
} else {
  const key = Buffer.from(encodedKey, "base64");
  const valid = key.length === 32 && key.toString("base64") === encodedKey;
  key.fill(0);
  if (!valid) fail("FISCAL_ENCRYPTION_KEY deve ser Base64 canônica que decodifica para exatamente 32 bytes.");
  else console.log("[fiscal-runtime] FISCAL_ENCRYPTION_KEY: formato válido (32 bytes; valor oculto).");
}

const ambiente = process.env.FISCAL_NFSE_AMBIENTE?.trim() || "producao_restrita";
if (ambiente !== "producao" && ambiente !== "producao_restrita") {
  fail("FISCAL_NFSE_AMBIENTE deve ser 'producao' ou 'producao_restrita'.");
}
const configuredSchema = ambiente === "producao"
  ? process.env.NFSE_DPS_XSD_PATH_PRODUCAO?.trim()
  : process.env.NFSE_DPS_XSD_PATH_PRODUCAO_RESTRITA?.trim() || process.env.NFSE_DPS_XSD_PATH?.trim();
const defaultSchemaCandidates = ambiente === "producao"
  ? [
      resolve(process.cwd(), "supabase/schemas/nfse/producao-20260209/DPS_v1.01.xsd"),
      resolve(process.cwd(), "supabase/schemas/nfse/producao/DPS_v1.01.xsd"),
    ]
  : [
      resolve(process.cwd(), "supabase/schemas/nfse/producao-restrita-20261020/DPS_v1.01.xsd"),
      resolve(process.cwd(), "supabase/schemas/nfse/DPS_v1.01.xsd"),
    ];
const schemaCandidates = configuredSchema
  ? [isAbsolute(configuredSchema) ? configuredSchema : resolve(process.cwd(), configuredSchema)]
  : defaultSchemaCandidates;
const schema = schemaCandidates.find((path) => existsSync(path));
if (!schema) {
  const variable = ambiente === "producao" ? "NFSE_DPS_XSD_PATH_PRODUCAO" : "NFSE_DPS_XSD_PATH_PRODUCAO_RESTRITA";
  fail(`XSD oficial do ambiente ${ambiente} não encontrado; configure ${variable}.`);
} else console.log(`[fiscal-runtime] Ambiente SEFIN: ${ambiente}; XSD: ${realpathSync(schema)}`);

const xmllint = process.env.NFSE_XMLLINT_BIN?.trim() || "xmllint";
const result = spawnSync(xmllint, ["--version"], { encoding: "utf8", timeout: 5000, windowsHide: true });
if (result.error || result.status !== 0) {
  fail("xmllint/libxml2 não está acessível. Instale-o no runtime ou configure NFSE_XMLLINT_BIN.");
} else {
  const version = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split(/\r?\n/, 1)[0];
  console.log(`[fiscal-runtime] Validador XSD disponível: ${version || "versão identificada"}.`);
}

if (!process.exitCode) console.log("[fiscal-runtime] Ambiente apto para iniciar os testes fiscais.");
