import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

const MAX_XML_BYTES = 1_048_576;
const VALIDATION_TIMEOUT_MS = 5_000;
export type FiscalNfseEnvironment = "producao" | "producao_restrita";

function schemaCandidatesFor(ambiente: FiscalNfseEnvironment): string[] {
  if (ambiente === "producao") {
    return [
      resolve(process.cwd(), "supabase/schemas/nfse/producao-20260209/DPS_v1.01.xsd"),
      resolve(process.cwd(), "supabase/schemas/nfse/producao/DPS_v1.01.xsd"),
    ];
  }
  return [
    resolve(process.cwd(), "supabase/schemas/nfse/producao-restrita-20261020/DPS_v1.01.xsd"),
    resolve(process.cwd(), "supabase/schemas/nfse/DPS_v1.01.xsd"),
  ];
}

export type DpsXsdValidationResult = { valid: true; schemaPath: string; validator: "xmllint/libxml2"; compatibility: "none" | "normalized-xsd-pattern-anchors" };

function resolveSchemaPath(ambiente: FiscalNfseEnvironment): string {
  const configuredPath = ambiente === "producao"
    ? process.env.NFSE_DPS_XSD_PATH_PRODUCAO?.trim()
    : process.env.NFSE_DPS_XSD_PATH_PRODUCAO_RESTRITA?.trim() || process.env.NFSE_DPS_XSD_PATH?.trim();
  const candidates = configuredPath
    ? [isAbsolute(configuredPath) ? configuredPath : resolve(process.cwd(), configuredPath)]
    : schemaCandidatesFor(ambiente);
  const candidate = candidates.find((path) => existsSync(path));
  if (!candidate) {
    const variable = ambiente === "producao" ? "NFSE_DPS_XSD_PATH_PRODUCAO" : "NFSE_DPS_XSD_PATH_PRODUCAO_RESTRITA";
    throw new Error(`DPS_XSD_SCHEMA_UNAVAILABLE: XSD oficial do ambiente ${ambiente} não encontrado. Configure ${variable} ou inclua o pacote XSD correspondente no deploy. Nenhum envio foi realizado.`);
  }
  return realpathSync(candidate);
}

/** Checks runtime prerequisites without logging or retaining secret key material. */
export function assertFiscalRuntimeReady(ambiente: FiscalNfseEnvironment = "producao_restrita"): { schemaPath: string; xmllint: string } {
  const encodedKey = process.env.FISCAL_ENCRYPTION_KEY;
  if (!encodedKey) {
    throw new Error("FISCAL_RUNTIME_NOT_READY: FISCAL_ENCRYPTION_KEY ausente; operação fiscal bloqueada.");
  }
  const decodedKey = Buffer.from(encodedKey, "base64");
  const validKey = decodedKey.length === 32 && decodedKey.toString("base64") === encodedKey;
  decodedKey.fill(0);
  if (!validKey) {
    throw new Error("FISCAL_RUNTIME_NOT_READY: FISCAL_ENCRYPTION_KEY deve ser Base64 canônica de exatamente 32 bytes; operação fiscal bloqueada.");
  }

  const schemaPath = resolveSchemaPath(ambiente);
  const xmllint = process.env.NFSE_XMLLINT_BIN?.trim() || "xmllint";
  try {
    execFileSync(xmllint, ["--version"], { encoding: "utf8", timeout: VALIDATION_TIMEOUT_MS, maxBuffer: 64 * 1024, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    throw new Error("FISCAL_RUNTIME_NOT_READY: xmllint/libxml2 indisponível. Instale o validador ou configure NFSE_XMLLINT_BIN; nenhuma emissão será autorizada.");
  }
  return { schemaPath, xmllint };
}

/**
 * The published production XSD contains ^...$ anchors in xs:pattern values.
 * XML Schema regex syntax has no anchor operators, so libxml2 treats those
 * characters literally and rejects otherwise valid series values. Preserve the
 * pinned official files unchanged, but validate a temporary standards-compatible
 * copy with only those non-XSD anchors removed. The original schema path is
 * still reported to make the compatibility treatment explicit.
 */
function createProductionCompatibilitySchema(schemaPath: string, tempDirectory: string): string {
  const sourceDirectory = dirname(schemaPath);
  const compatibilityDirectory = join(tempDirectory, "production-xsd");
  mkdirSync(compatibilityDirectory, { mode: 0o700 });
  for (const filename of readdirSync(sourceDirectory)) {
    if (!filename.endsWith(".xsd")) continue;
    const sourcePath = join(sourceDirectory, filename);
    const targetPath = join(compatibilityDirectory, filename);
    const original = readFileSync(sourcePath, "utf8");
    const normalized = original
      .replace(/(<xs:pattern\\b[^>]*\\bvalue=")\\^/g, "$1")
      .replace(/(<xs:pattern\\b[^>]*\\bvalue="[^"]*)\\$(?=")/g, "$1");
    writeFileSync(targetPath, normalized, { encoding: "utf8", flag: "wx", mode: 0o600 });
  }
  const root = join(compatibilityDirectory, basename(schemaPath));
  if (!existsSync(root)) throw new Error("DPS_XSD_SCHEMA_UNAVAILABLE: cópia compatível do XSD de produção não foi criada.");
  return root;
}

/** Validates the exact signed DPS against the official XSD; unavailable validator always fails closed. */
export function assertDpsRequiredGroups(xml: string, ambiente: FiscalNfseEnvironment = "producao_restrita"): DpsXsdValidationResult {
  const xmlBuffer = Buffer.from(xml, "utf8");
  if (xmlBuffer.byteLength === 0 || xmlBuffer.byteLength > MAX_XML_BYTES) {
    throw new Error("DPS_XSD_INVALID: XML vazio ou excede o limite de 1 MiB.");
  }
  if (xml.includes("<!DOCTYPE") || xml.includes("<!ENTITY")) {
    throw new Error("DPS_XSD_INVALID: declarações DTD/ENTITY não são permitidas.");
  }

  const runtime = assertFiscalRuntimeReady(ambiente);
  const tempDirectory = mkdtempSync(join(tmpdir(), "critical-cash-dps-xsd-"));
  const xmlPath = join(tempDirectory, basename("document.xml"));
  const validationSchemaPath = ambiente === "producao"
    ? createProductionCompatibilitySchema(runtime.schemaPath, tempDirectory)
    : runtime.schemaPath;
  try {
    writeFileSync(xmlPath, xmlBuffer, { flag: "wx", mode: 0o600 });
    try {
      execFileSync(runtime.xmllint, ["--nonet", "--noout", "--schema", validationSchemaPath, xmlPath], { encoding: "utf8", timeout: VALIDATION_TIMEOUT_MS, maxBuffer: 1_048_576, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      const failure = error as NodeJS.ErrnoException & { signal?: NodeJS.Signals | null; stderr?: string | Buffer; stdout?: string | Buffer };
      const diagnostic = String(failure.stderr || failure.stdout || "").replace(/[\r\n\t]+/g, " ").slice(0, 500);
      if (failure.code === "ETIMEDOUT" || failure.signal === "SIGTERM") {
        throw new Error("DPS_XSD_VALIDATION_TIMEOUT: tempo limite da validação XSD excedido.");
      }
      throw new Error(diagnostic ? `DPS_XSD_INVALID: XML rejeitado pelo XSD oficial: ${diagnostic}` : "DPS_XSD_INVALID: xmllint não conseguiu validar o XML contra o XSD oficial.");
    }
    return { valid: true, schemaPath: runtime.schemaPath, validator: "xmllint/libxml2", compatibility: ambiente === "producao" ? "normalized-xsd-pattern-anchors" : "none" };
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}
