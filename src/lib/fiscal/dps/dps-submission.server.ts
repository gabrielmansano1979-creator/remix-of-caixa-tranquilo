import axios, { isAxiosError } from "axios";
import { DOMParser, type Document, type Element } from "@xmldom/xmldom";
import { createFiscalMtlsConnection } from "../security/mtls-agent.server";

export type FiscalRejection = {
  code?: string;
  message: string;
  correction?: string;
};

export type DpsSubmissionResult =
  | {
      kind: "emitted";
      status: number;
      contentType?: string;
      body: string;
      accessKey?: string;
    }
  | {
      kind: "rejected";
      status: number;
      contentType?: string;
      message: string;
      errors: FiscalRejection[];
      body: string;
    }
  | {
      kind: "protocol_error";
      status: number;
      contentType?: string;
      message: string;
      body: string;
    }
  | {
      kind: "transport_error";
      message: string;
      retryable: boolean;
    };

const DEFAULT_ENDPOINT_PATH = "/SefinNacional/nfse";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

type ParsedFiscalResponse = {
  errors: FiscalRejection[];
  accessKey?: string;
  hasInvoice: boolean;
  parseError?: string;
};

function localName(element: Element): string {
  return element.localName || element.nodeName.split(":").pop() || element.nodeName;
}

function childText(element: Element, wantedNames: string[]): string | undefined {
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType !== 1) continue;
    const childElement = child as Element;
    if (wantedNames.includes(localName(childElement))) {
      const value = childElement.textContent?.trim();
      if (value) return value;
    }
  }
  return undefined;
}

function elementsByLocalName(document: Document, names: string[]): Element[] {
  const all = Array.from(document.getElementsByTagName("*"));
  return all.filter((element) => names.includes(localName(element as Element))) as Element[];
}

/** Parses common SEFIN/ADN XML response shapes without depending on namespace prefixes. */
function parseFiscalResponse(xml: string): ParsedFiscalResponse {
  if (!xml.trim()) {
    return { errors: [], hasInvoice: false, parseError: "A SEFIN retornou uma resposta vazia." };
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    return { errors: [], hasInvoice: false, parseError: "A resposta XML contém declarações não permitidas." };
  }

  const parserErrors: string[] = [];
  const doc = new DOMParser({
    errorHandler: (level: string, message: string) => {
      if (level === "error" || level === "fatalError") parserErrors.push(message);
    },
  }).parseFromString(xml, "application/xml");

  if (
    parserErrors.length > 0 ||
    elementsByLocalName(doc, ["parsererror"]).length > 0 ||
    !doc.documentElement
  ) {
    return { errors: [], hasInvoice: false, parseError: "A SEFIN retornou um XML inválido." };
  }

  const errors: FiscalRejection[] = [];
  const errorContainers = elementsByLocalName(doc, [
    "MensagemRetorno",
    "MensagemRetornoLote",
    "Erros",
    "erros",
    "Erro",
    "erro",
  ]);

  for (const element of errorContainers) {
    const code = childText(element, [
      "Codigo", "Código", "codigo", "codigoErro", "cStat",
    ]);
    const message =
      childText(element, [
        "Mensagem", "Descricao", "Descrição", "descricao", "mensagem", "xMotivo",
      ]) ??
      (localName(element) === "Mensagem" ? element.textContent?.trim() : undefined);
    const correction = childText(element, [
      "Correcao", "Correção", "correcao", "correcaoErro", "Complemento",
    ]);
    if (message || code) {
      errors.push({
        ...(code ? { code } : {}),
        message: message || "A SEFIN informou uma rejeição fiscal sem descrição.",
        ...(correction ? { correction } : {}),
      });
    }
  }

  // Some providers return a bare Mensagem node rather than a structured
  // MensagemRetorno/Erro element. Use it only as a fallback to avoid duplicate
  // errors when the same text is nested inside a structured message.
  if (errors.length === 0) {
    for (const element of elementsByLocalName(doc, ["Mensagem"])) {
      const message = element.textContent?.trim();
      if (message) errors.push({ message });
    }
  }

  // Namespace prefixes vary between environments; match by local element name.
  const keyElement = elementsByLocalName(doc, [
    "chNFSe", "ChaveAcesso", "chaveAcesso", "ChaveNfse", "chaveNfse",
  ])[0];
  const accessKey = keyElement?.textContent?.trim() || undefined;
  const hasInvoice =
    elementsByLocalName(doc, ["NFSe", "infNFSe", "InfNfse", "Nfse"]).length > 0 ||
    Boolean(accessKey);

  return { errors, hasInvoice, ...(accessKey ? { accessKey } : {}) };
}

function contentTypeOf(headers: Record<string, unknown>): string | undefined {
  const value = headers["content-type"];
  return typeof value === "string" ? value : undefined;
}

function friendlyTransportMessage(error: unknown): { message: string; retryable: boolean } {
  if (!isAxiosError(error)) {
    return {
      message: "Não foi possível concluir a comunicação com a SEFIN. Verifique a configuração fiscal e tente novamente.",
      retryable: false,
    };
  }

  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    return {
      message: "A SEFIN demorou para responder. Antes de reenviar, confira se a nota já foi emitida para evitar duplicidade.",
      retryable: true,
    };
  }
  if (error.code === "ECONNRESET" || error.code === "ECONNREFUSED" || error.code === "EAI_AGAIN") {
    return {
      message: "Não foi possível estabelecer conexão com a SEFIN. Tente novamente mais tarde.",
      retryable: true,
    };
  }
  if (error.code === "CERT_HAS_EXPIRED" || error.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
    return {
      message: "A conexão segura com a SEFIN falhou na validação do certificado. Verifique o certificado fiscal e a cadeia de confiança.",
      retryable: false,
    };
  }
  return {
    message: "Falha de comunicação com a SEFIN. Confira o ambiente e o certificado fiscal antes de tentar novamente.",
    retryable: false,
  };
}

/**
 * Submits one signed DPS to the synchronous SEFIN Nacional REST API.
 *
 * Security: authenticate the caller and authorize tenant ownership before
 * calling this service. Never log the signed XML, PFX, passphrase, or taxpayer
 * data. Business rejections and network failures are returned as typed results.
 */
export async function submitSignedDps(input: {
  tenantUserId: string;
  fiscalConfigId: string;
  signedDpsXml: string;
  endpointPath?: string;
}): Promise<DpsSubmissionResult> {
  const signedDpsXml = input.signedDpsXml.trim();
  if (
    !signedDpsXml.startsWith("<") ||
    !/<(?:[\w.-]+:)?DPS(?:\s|>)/.test(signedDpsXml) ||
    !/<(?:[\w.-]+:)?Signature(?:\s|>)/.test(signedDpsXml)
  ) {
    return {
      kind: "protocol_error",
      status: 0,
      message: "O envio exige um XML DPS válido e assinado digitalmente.",
      body: "",
    };
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(signedDpsXml)) {
    return {
      kind: "protocol_error",
      status: 0,
      message: "O XML da DPS contém declarações não permitidas.",
      body: "",
    };
  }

  // Only allow a path, never an arbitrary URL, so a caller cannot redirect
  // the mTLS client certificate to an untrusted host.
  const endpointPath = input.endpointPath ?? DEFAULT_ENDPOINT_PATH;
  if (!endpointPath.startsWith("/") || endpointPath.startsWith("//") || endpointPath.includes("://")) {
    return {
      kind: "protocol_error",
      status: 0,
      message: "O caminho do endpoint fiscal está inválido.",
      body: "",
    };
  }

  let connection: Awaited<ReturnType<typeof createFiscalMtlsConnection>> | undefined;
  try {
    connection = await createFiscalMtlsConnection(input.tenantUserId, input.fiscalConfigId);
    const endpoint = new URL(endpointPath, connection.baseUrl).toString();

    const response = await axios.post<string>(endpoint, signedDpsXml, {
      httpsAgent: connection.agent,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        Accept: "application/xml",
      },
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
      maxBodyLength: MAX_REQUEST_BYTES,
      maxContentLength: MAX_RESPONSE_BYTES,
      responseType: "text",
      transformResponse: [(data: unknown) => String(data ?? "")],
      // Return 4xx to the parser because those responses commonly contain
      // structured fiscal validation messages. Treat 5xx as transport failure.
      validateStatus: (status) => status >= 200 && status < 500,
    });

    const body = typeof response.data === "string" ? response.data : String(response.data ?? "");
    const contentType = contentTypeOf(response.headers as Record<string, unknown>);
    const parsed = parseFiscalResponse(body);

    if (parsed.errors.length > 0 || (response.status >= 400 && !parsed.hasInvoice)) {
      return {
        kind: "rejected",
        status: response.status,
        ...(contentType ? { contentType } : {}),
        message: parsed.errors[0]?.message ?? "A SEFIN recusou a solicitação. Confira os dados fiscais e tente novamente.",
        errors: parsed.errors.length
          ? parsed.errors
          : [{ message: "A SEFIN recusou a solicitação sem retornar detalhes fiscais estruturados." }],
        body,
      };
    }

    if (response.status >= 200 && response.status < 300 && parsed.hasInvoice) {
      return {
        kind: "emitted",
        status: response.status,
        ...(contentType ? { contentType } : {}),
        body,
        ...(parsed.accessKey ? { accessKey: parsed.accessKey } : {}),
      };
    }

    return {
      kind: "protocol_error",
      status: response.status,
      ...(contentType ? { contentType } : {}),
      message: parsed.parseError ??
        "A resposta da SEFIN não confirmou a emissão nem apresentou uma rejeição fiscal reconhecível.",
      body,
    };
  } catch (error) {
    // Do not expose raw Axios errors or response bodies to the UI; they may
    // contain infrastructure details or taxpayer information.
    const friendly = friendlyTransportMessage(error);
    return { kind: "transport_error", ...friendly };
  } finally {
    connection?.destroy();
  }
}
