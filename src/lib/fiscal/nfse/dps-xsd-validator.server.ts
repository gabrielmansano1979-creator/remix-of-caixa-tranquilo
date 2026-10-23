import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const MAX_XML_BYTES = 1_048_576;
const VALIDATION_TIMEOUT_MS = 5_000;
const DEFAULT_XSD = resolve(
  process.cwd(),
  "supabase/schemas/nfse/producao-restrita-20261020/DPS_v1.01.xsd",
);

export type DpsXsdValidationResult = {
  valid: true;
  schemaPath: string;
  validator: "xmllint/libxml2";
};

/**
 * Validates the exact XML bytes that will be sent to SEFIN against the official
 * Produção Restrita XSD bundle. Install the official 2026-10-20 bundle under
 * supabase/schemas/nfse/producao-restrita-20261020 or set NFSE_DPS_XSD_PATH
 * to its DPS_v1.01.xsd file. The XSD's imported files must remain beside it.
 *
 * Requires xmllint (libxml2) in the runtime image. No network schema resolution
 * is permitted. Missing schema/engine and any schema error fail closed.
 */
export function assertDpsRequiredGroups(xml: string): DpsXsdValidationResult {
  const xmlBuffer = Buffer.from(xml, "utf8");
  if (xmlBuffer.byteLength === 0 || xmlBuffer.byteLength > MAX_XML_BYTES) {
    throw new Error("DPS_XSD_INVALID: XML vazio ou excede o limite de 1 MiB.");
  }
  if (xml.includes("<!DOCTYPE") || xml.includes("<!ENTITY")) {
    throw new Error("DPS_XSD_INVALID: declarações DTD/ENTITY não são permitidas.");
  }

  const configuredPath = process.env.NFSE_DPS_XSD_PATH?.trim();
  const schemaCandidate = configuredPath
    ? (isAbsolute(configuredPath) ? configuredPath : resolve(process.cwd(), configuredPath))
    : DEFAULT_XSD;

  if (!existsSync(schemaCandidate)) {
    throw new Error(
      "DPS_XSD_SCHEMA_UNAVAILABLE: instale o pacote XSD oficial de Produção Restrita v1.01-20261020 e configure NFSE_DPS_XSD_PATH. Nenhum envio foi realizado.",
    );
  }

  const schemaPath = realpathSync(schemaCandidate);
  const executable = process.env.NFSE_XMLLINT_BIN?.trim() || "xmllint";
  const result = spawnSync(
    executable,
    ["--nonet", "--noout", "--schema", schemaPath, "-"],
    {
      input: xmlBuffer,
      encoding: "utf8",
      timeout: VALIDATION_TIMEOUT_MS,
      maxBuffer: 1_048_576,
      windowsHide: true,
    },
  );

  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(
        "DPS_XSD_ENGINE_UNAVAILABLE: xmllint/libxml2 não está instalado no runtime. Nenhum envio foi realizado.",
      );
    }
    throw new Error("DPS_XSD_VALIDATION_FAILED: o validador XSD não concluiu a validação.");
  }

  if (result.signal || result.status !== 0) {
    // Limit diagnostics to prevent large/untrusted XML or parser output entering logs.
    const diagnostic = String(result.stderr || result.stdout || "")
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, 500);
    throw new Error(
      diagnostic
        ? `DPS_XSD_INVALID: XML rejeitado pelo XSD oficial: ${diagnostic}`
        : "DPS_XSD_INVALID: XML rejeitado pelo XSD oficial.",
    );
  }

  return { valid: true, schemaPath, validator: "xmllint/libxml2" };
}
