import {
  generateNfeKey,
  type NfeKeyInput,
  type NfeKeyResult,
} from "../utils/nfe-key-generator.server";

export const NFE_XML_NAMESPACE = "http://www.portalfiscal.inf.br/nfe";
export const NFE_XML_VERSION = "4.00";

export type NfeBaseXmlInput = NfeKeyInput;
export type NfeBaseXmlResult = NfeKeyResult & { xml: string };

/**
 * Monta o envelope inicial da NF-e/NFC-e com namespace oficial e Id vinculado
 * à chave de acesso gerada.
 *
 * IMPORTANTE: este é apenas um esqueleto de desenvolvimento. infNFe vazio NÃO
 * atende ao XSD completo e nunca deve ser transmitido à SEFAZ. Antes de emitir,
 * preencher todos os grupos obrigatórios do leiaute 4.00, validar contra os XSD
 * oficiais vigentes e assinar o XML segundo as regras fiscais aplicáveis.
 */
export function generateNfeBaseXml(input: NfeBaseXmlInput): NfeBaseXmlResult {
  const key = generateNfeKey(input);
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<NFe xmlns="${NFE_XML_NAMESPACE}">`,
    `  <infNFe Id="${key.id}" versao="${NFE_XML_VERSION}">`,
    "  </infNFe>",
    "</NFe>",
  ].join("\n");

  return { ...key, xml };
}
