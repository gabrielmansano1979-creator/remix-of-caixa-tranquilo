import { request, type Agent } from "node:https";
import { gzipSync } from "node:zlib";
import type { NfseOfficialResult } from "./nfse-submission.server";

export class NfseTransportError extends Error {
  constructor(message: string, readonly uncertainOutcome: boolean, options?: ErrorOptions) {
    super(message, options);
    this.name = "NfseTransportError";
  }
}
type ClientOptions = { baseUrl: string; agent: Agent; timeoutMs?: number };
type ApiPayload = { accessKey?: string; chaveAcesso?: string; protocolo?: string; codigoStatus?: string; mensagem?: string; erros?: unknown[] };

function requestText(options: ClientOptions, method: string, path: string, body?: string): Promise<{ status: number; body: string }> {
  const url = new URL(path, options.baseUrl);
  if (url.protocol !== "https:" || !["sefin.nfse.gov.br", "sefin.producaorestrita.nfse.gov.br"].includes(url.hostname)) {
    throw new Error("Host SEFIN não permitido.");
  }
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method,
      agent: options.agent,
      timeout: options.timeoutMs ?? 20_000,
      headers: body ? { "content-type": "application/json; charset=utf-8", accept: "application/json", "content-length": Buffer.byteLength(body) } : { accept: "application/json" },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new Error("Timeout na comunicação com SEFIN.")));
    req.on("error", (error) => reject(new NfseTransportError(error.message, true, { cause: error })));
    if (body) req.write(body);
    req.end();
  });
}
function parseBody(body: string): ApiPayload {
  try { return JSON.parse(body) as ApiPayload; } catch { return { mensagem: body }; }
}
function resultFrom(status: number, body: string): NfseOfficialResult {
  const payload = parseBody(body);
  const accepted = status >= 200 && status < 300 && Boolean(payload.accessKey || payload.chaveAcesso || payload.protocolo);
  return {
    accepted,
    accessKey: payload.accessKey ?? payload.chaveAcesso,
    protocol: payload.protocolo,
    statusCode: payload.codigoStatus ?? String(status),
    rejectionReason: accepted ? undefined : payload.mensagem ?? (payload.erros ? JSON.stringify(payload.erros) : body.slice(0, 2000)),
    responseBody: payload,
  };
}

/**
 * SEFIN Nacional POST /nfse contract: JSON { dpsXmlGZipB64 }, where the signed
 * DPS XML is compressed with GZip and then encoded as Base64.
 */
export async function submitSignedDps(input: ClientOptions & { signedXml: string }): Promise<NfseOfficialResult> {
  if (!/<(?:[A-Za-z_][\w.-]*:)?Signature\b/.test(input.signedXml) || !input.signedXml.includes("</DPS>")) {
    throw new Error("DPS assinada inválida; transmissão bloqueada.");
  }
  const dpsXmlGZipB64 = gzipSync(Buffer.from(input.signedXml, "utf8")).toString("base64");
  const body = JSON.stringify({ dpsXmlGZipB64 });
  const response = await requestText(input, "POST", "/SefinNacional/nfse", body);
  return resultFrom(response.status, response.body);
}
export async function queryDps(input: ClientOptions & { dpsId: string }): Promise<NfseOfficialResult | null> {
  if (!/^ID\d{42}$/.test(input.dpsId)) throw new Error("Identificador DPS inválido.");
  const path = `/SefinNacional/dps/${encodeURIComponent(input.dpsId)}`;
  const head = await requestText(input, "HEAD", path);
  if (head.status === 404) return null;
  if (head.status >= 200 && head.status < 300) {
    const get = await requestText(input, "GET", path);
    if (get.status >= 200 && get.status < 300) {
      const result = resultFrom(get.status, get.body);
      if (result.accessKey) return result;
    }
    // HEAD confirms that the DPS exists, but without the GET result we must not resend.
    throw new NfseTransportError("A DPS já foi processada, mas a chave de acesso não foi recuperada. Resultado incerto; não retransmitir.", true);
  }
  if (head.status >= 500) throw new NfseTransportError("Consulta DPS retornou erro temporário; não retransmitir sem nova consulta.", true);
  return { accepted: false, statusCode: String(head.status), rejectionReason: head.body, responseBody: head.body };
}
