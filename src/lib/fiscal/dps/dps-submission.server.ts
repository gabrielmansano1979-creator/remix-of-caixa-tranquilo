import axios from "axios";
import { createFiscalMtlsConnection } from "../security/mtls-agent.server";

export type DpsSubmissionResult = {
  status: number;
  contentType: string | undefined;
  body: string;
};

/**
 * Sends a signed DPS to the synchronous SEFIN Nacional API.
 * Authenticate the user and authorize tenant ownership before calling this
 * function. Fiscal rejections (4xx) are returned to the caller as normal
 * protocol responses; do not log the XML, certificate, or taxpayer data.
 */
export async function submitSignedDps(input: {
  tenantUserId: string;
  fiscalConfigId: string;
  signedDpsXml: string;
}): Promise<DpsSubmissionResult> {
  if (!input.signedDpsXml.includes("<DPS") || !input.signedDpsXml.includes("<Signature")) {
    throw new Error("O envio exige um XML DPS assinado.");
  }

  const connection = await createFiscalMtlsConnection(
    input.tenantUserId,
    input.fiscalConfigId,
  );

  try {
    // Current SEFIN Nacional synchronous API accepts the DPS XML at POST /nfse.
    // Do not wrap it in the older EnviarLoteDpsEnvio envelope for this endpoint.
    const endpoint = new URL("/SefinNacional/nfse", connection.baseUrl).toString();
    const response = await axios.post<string>(endpoint, input.signedDpsXml, {
      httpsAgent: connection.agent,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        Accept: "application/xml, application/json",
      },
      timeout: 30_000,
      maxRedirects: 0,
      maxBodyLength: 2 * 1024 * 1024,
      maxContentLength: 10 * 1024 * 1024,
      responseType: "text",
      transformResponse: [(data: unknown) => String(data ?? "")],
      // SEFIN validation errors are useful protocol responses, not transport errors.
      validateStatus: (status) => status >= 200 && status < 500,
    });

    return {
      status: response.status,
      contentType: response.headers["content-type"],
      body: response.data,
    };
  } finally {
    connection.destroy();
  }
}
