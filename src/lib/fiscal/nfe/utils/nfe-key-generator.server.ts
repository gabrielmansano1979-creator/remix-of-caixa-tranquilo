/**
 * Geração da chave de acesso NF-e/NFC-e conforme composição nacional de 44 dígitos.
 * Esta função gera a chave; não substitui a validação fiscal nem a assinatura XML.
 */

export type NfeModel = "55" | "65";

export type NfeKeyInput = {
  /** Código IBGE da UF (2 dígitos). */
  cUF: string;
  /** Ano e mês de emissão no formato AAMM (4 dígitos). */
  aamm: string;
  /** CNPJ do emitente (14 dígitos numéricos). */
  cnpj: string;
  /** 55 = NF-e; 65 = NFC-e. */
  mod: NfeModel;
  /** Série fiscal, de 1 a 3 dígitos. */
  serie: string;
  /** Número da nota, de 1 a 9 dígitos. */
  nNF: string;
  /** Tipo de emissão, um dígito. */
  tpEmis: string;
  /** Código numérico da NF-e/NFC-e, exatamente 8 dígitos. */
  cNF: string;
};

export type NfeKeyResult = {
  chave: string;
  idXml: string;
};

function assertDigits(name: string, value: string, length: number): void {
  if (!new RegExp("^\\d{" + length + "}$").test(value)) {
    throw new Error(name + " deve conter exatamente " + length + " dígitos numéricos.");
  }
}

/** Calcula o DV usando módulo 11 e pesos 2..9 da direita para a esquerda. */
export function calculateNfeCheckDigit(first43Digits: string): string {
  if (!/^\d{43}$/.test(first43Digits)) {
    throw new Error("O cálculo do DV exige exatamente 43 dígitos numéricos.");
  }

  let sum = 0;
  let weight = 2;
  for (let index = first43Digits.length - 1; index >= 0; index -= 1) {
    sum += Number(first43Digits[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }

  const candidate = 11 - (sum % 11);
  return candidate === 10 || candidate === 11 ? "0" : String(candidate);
}

/**
 * cUF(2) + AAMM(4) + CNPJ(14) + mod(2) + serie(3) + nNF(9)
 * + tpEmis(1) + cNF(8) + DV(1) = 44 dígitos.
 */
export function generateNfeKey(input: NfeKeyInput): NfeKeyResult {
  assertDigits("cUF", input.cUF, 2);
  assertDigits("aamm", input.aamm, 4);
  assertDigits("cnpj", input.cnpj, 14);
  assertDigits("tpEmis", input.tpEmis, 1);
  assertDigits("cNF", input.cNF, 8);

  if (input.mod !== "55" && input.mod !== "65") {
    throw new Error("O modelo fiscal deve ser '55' (NF-e) ou '65' (NFC-e).");
  }
  if (!/^\d{1,3}$/.test(input.serie)) {
    throw new Error("serie deve conter de 1 a 3 dígitos numéricos.");
  }
  if (!/^\d{1,9}$/.test(input.nNF)) {
    throw new Error("nNF deve conter de 1 a 9 dígitos numéricos.");
  }

  const first43Digits =
    input.cUF +
    input.aamm +
    input.cnpj +
    input.mod +
    input.serie.padStart(3, "0") +
    input.nNF.padStart(9, "0") +
    input.tpEmis +
    input.cNF;

  if (first43Digits.length !== 43) {
    throw new Error("A composição da chave fiscal não resultou em 43 dígitos antes do DV.");
  }

  const chave = first43Digits + calculateNfeCheckDigit(first43Digits);
  if (chave.length !== 44) {
    throw new Error("A chave fiscal gerada não contém 44 dígitos.");
  }

  return { chave, idXml: "NFe" + chave };
}
