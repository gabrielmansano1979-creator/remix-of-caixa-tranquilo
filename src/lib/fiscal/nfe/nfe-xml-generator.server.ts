/**
 * Creates a well-formed NF-e/NFC-e XML scaffold.
 *
 * IMPORTANT: this is not a complete schema-valid fiscal document. Populate all
 * required fields and validate against current official XSDs before signing
 * or transmitting.
 */
export const NFE_XML_NAMESPACE = "http://www.portalfiscal.inf.br/nfe";
export type NfeModel = "55" | "65";

export type NfeXmlSkeletonInput = {
  /** 44 numeric digits from the calculated access key, without the "NFe" prefix. */
  accessKey: string;
  model?: NfeModel;
  environment?: 1 | 2;
};

function assertAccessKey(accessKey: string): void {
  if (!/^\d{44}$/.test(accessKey)) {
    throw new Error("A chave de acesso da NF-e deve conter exatamente 44 dígitos numéricos.");
  }
  const model = accessKey.slice(20, 22);
  if (model !== "55" && model !== "65") {
    throw new Error("A chave de acesso deve identificar o modelo 55 (NF-e) ou 65 (NFC-e).");
  }
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Returns a scaffold with the official NF-e namespace and Id="NFe{44-digit key}".
 * The model in the key must match the requested model when model is provided.
 */
export function buildNfeXmlSkeleton(input: NfeXmlSkeletonInput): string {
  assertAccessKey(input.accessKey);
  const model = input.model ?? (input.accessKey.slice(20, 22) as NfeModel);
  const environment = input.environment ?? 2;

  if (input.accessKey.slice(20, 22) !== model) {
    throw new Error("O modelo informado não corresponde ao modelo codificado na chave de acesso.");
  }
  if (environment !== 1 && environment !== 2) {
    throw new Error("Ambiente inválido: use 1 (produção) ou 2 (homologação).");
  }

  const id = xmlEscape("NFe" + input.accessKey);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<NFe xmlns="' + NFE_XML_NAMESPACE + '">',
    '  <infNFe Id="' + id + '" versao="4.00">',
    "    <!-- SCAFFOLD ONLY: complete ide, emit, dest, det, total, transp, pag and other required groups. -->",
    "    <ide>",
    "      <mod>" + model + "</mod>",
    "      <tpAmb>" + environment + "</tpAmb>",
    "    </ide>",
    "    <!-- TODO: issuer, recipient, products, taxes, totals, transport and payment. -->",
    "  </infNFe>",
    "</NFe>",
  ].join("\n");
}
