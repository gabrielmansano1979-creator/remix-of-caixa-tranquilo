import {
  calculateNfeCheckDigit,
  type NfeModel,
} from "../utils/nfe-key-generator.server";

const NFE_NAMESPACE = "http://www.portalfiscal.inf.br/nfe";

export type NfeBaseXmlInput = {
  /** Chave de acesso com exatamente 44 dígitos numéricos e DV consistente. */
  chave: string;
  /** Modelo 55 (NF-e) ou 65 (NFC-e), opcional se inferido da chave. */
  modelo?: NfeModel;
};

function assertAccessKey(chave: string): void {
  if (!/^\d{44}$/.test(chave)) {
    throw new Error("A chave de acesso deve conter exatamente 44 dígitos numéricos.");
  }

  const expectedDv = calculateNfeCheckDigit(chave.slice(0, 43));
  if (chave[43] !== expectedDv) {
    throw new Error("O dígito verificador da chave de acesso não confere.");
  }
}

/**
 * Monta o esqueleto NF-e/NFC-e 4.00 com o namespace oficial do SPED.
 *
 * Os grupos internos são intencionalmente vazios nesta fundação estrutural.
 * Este documento não passa no XSD e não pode ser transmitido até que todos os
 * campos obrigatórios sejam preenchidos na ordem do MOC/XSD vigente, assinado
 * digitalmente e validado. O grupo det já recebe nItem, atributo estrutural
 * obrigatório no layout para cada item.
 */
export function buildNfeBaseXml(input: NfeBaseXmlInput): string {
  assertAccessKey(input.chave);

  const modelInKey = input.chave.slice(20, 22);
  if (modelInKey !== "55" && modelInKey !== "65") {
    throw new Error("O modelo presente na chave deve ser 55 ou 65.");
  }

  const model = input.modelo ?? modelInKey;
  if (model !== modelInKey) {
    throw new Error("O modelo informado não corresponde ao modelo codificado na chave de acesso.");
  }

  const idXml = "NFe" + input.chave;

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<NFe xmlns="' + NFE_NAMESPACE + '">',
    '  <infNFe Id="' + idXml + '" versao="4.00">',
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
