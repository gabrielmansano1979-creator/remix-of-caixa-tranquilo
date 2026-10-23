import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";

const MAX_XML_BYTES = 1_048_576;
const VALIDATION_TIMEOUT_MS = 5_000;
const DEFAULT_SCHEMA_CANDIDATES = [
  resolve(process.cwd(), "supabase/schemas/nfse/DPS_v1.01.xsd"),
  // The repository stores the official restricted-production bundle together,
  // so imported XSD files resolve relative to this schema.
  resolve(
    process.cwd(),
    "supabase/schemas/nfse/producao-restrita-20261020/DPS_v1.01.xsd",
  ),
];

let xmllintWarningLogged = false;

export type DpsXsdValidationResult = {
  valid: true;
  schemaPath: string;
  validator: "xmllint/libxml2" | "skipped-xmllint-unavailable";
  warning?: string;
};

function warnXmllintUnavailable(): void {
  if (xmllintWarningLogged) return;
  xmllintWarningLogged = true;
  console.warn(
    "[NFS-e] xmllint/libxml2 não está disponível neste runtime; a validação XSD foi ignorada. Configure xmllint para validar o XML antes da emissão.",
  );
}

/**
 * Validate a DPS against the official XSD bundle when xmllint is installed.
 *
 * NFSE_DPS_XSD_PATH may point to an absolute path or a path relative to cwd.
 * FISCAL_ENCRYPTION_KEY is intentionally consumed by the fiscal-secret crypto
 * service, not by XML validation; this module never reads or logs secret keys.
 *
 * Serverless fallback is deliberately non-fatal when the validator executable
 * is missing. In that case callers receive validator="skipped-xmllint-unavailable"
 * and should surface the warning/telemetry; this does NOT mean the XML is valid
 * against the XSD. Missing schema and actual validation errors remain failures.
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
  const schemaCandidates = configuredPath
    ? [
        isAbsolute(configuredPath)
          ? configuredPath
          : resolve(process.cwd(), configuredPath),
      ]
    : DEFAULT_SCHEMA_CANDIDATES;

  const schemaCandidate = schemaCandidates.find((candidate) =>
    existsSync(candidate),
  );
  if (!schemaCandidate) {
    throw new Error(
      "DPS_XSD_SCHEMA_UNAVAILABLE: XSD oficial não encontrado. Configure NFSE_DPS_XSD_PATH ou inclua o pacote XSD no artefato de deploy. Nenhum envio foi realizado.",
    );
  }

  const schemaPath = realpathSync(schemaCandidate);
  const executable = process.env.NFSE_XMLLINT_BIN?.trim() || "xmllint";
  const tempDirectory = mkdtempSync(join(tmpdir(), "critical-cash-dps-xsd-"));
  const xmlPath = join(tempDirectory, basename("document.xml"));

  try {
    writeFileSync(xmlPath, xmlBuffer, { flag: "wx", mode: 0o600 });

    try {
      execFileSync(
        executable,
        ["--nonet", "--noout", "--schema", schemaPath, xmlPath],
        {
          encoding: "utf8",
          timeout: VALIDATION_TIMEOUT_MS,
          maxBuffer: 1_048_576,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & {
        status?: number | null;
        signal?: NodeJS.Signals | null;
        stderr?: string | Buffer;
        stdout?: string | Buffer;
      };
      if (failure.code === "ENOENT") {
        warnXmllintUnavailable();
        return {
          valid: true,
          schemaPath,
          validator: "skipped-xmllint-unavailable",
          warning:
            "XSD não foi validado: xmllint/libxml2 não está instalado no runtime.",
        };
      }

      const diagnostic = String(failure.stderr || failure.stdout || "")
        .replace(/[\r\n\t]+/g, " ")
        .slice(0, 500);
      if (failure.code === "ETIMEDOUT" || failure.signal === "SIGTERM") {
        throw new Error("DPS_XSD_VALIDATION_TIMEOUT: tempo limite da validação XSD excedido.");
      }
      throw new Error(
        diagnostic
          ? `DPS_XSD_INVALID: XML rejeitado pelo XSD oficial: ${diagnostic}`
          : "DPS_XSD_INVALID: xmllint não conseguiu validar o XML contra o XSD oficial.",
      );
    }

    return { valid: true, schemaPath, validator: "xmllint/libxml2" };
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}
