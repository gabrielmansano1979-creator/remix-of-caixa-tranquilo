import type { GeneratedNfeKey } from "../utils/nfe-key-generator.server";

const NFE_NAMESPACE = "http://www.portalfiscal.inf.br/nfe";
const NFE_VERSION = "4.00";

export type NfeBaseXmlInput = {
  key: GeneratedNfeKey;
};

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}

/**
 * Gera um esqueleto XML bem-formado para NF-e/NFC-e 4.00.
 * Os grupos vazios são apenas a base estrutural e NÃO validam contra o XSD:
 * devem ser preenchidos com dados fiscais e todos os grupos obrigatórios do MOC
 * antes de assinar ou transmitir o documento.
 */
export function buildNfeBaseXml(input: NfeBaseXmlInput): string {
  const { chave, idXml } = input.key;
  if (!/^\d{44}$/.test(chave)) {
    throw new TypeError("A chave de acesso NF-e deve conter exatamente 44 dígitos.");
  }
  if (idXml !== `NFe${chave}`) {
    throw new TypeError('idXml deve ser exatamente "NFe" + chave.');
  }

  const safeId = escapeXmlAttribute(idXml);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<NFe xmlns="${NFE_NAMESPACE}">`,
    `  <infNFe Id="${safeId}" versao="${NFE_VERSION}">`,
    "    <ide></ide>",
    "    <emit></emit>",
    "    <dest></dest>",
    '    <det nItem="1"></det>',
    "    <total></total>",
    "    <transp></transp>",
    "  </infNFe>",
    "</NFe>",
  ].join("\n");
}
