/**
 * Geração da chave de acesso NF-e/NFC-e conforme composição do MOC.
 * A chave antes do DV possui 43 dígitos; o DV completa 44 dígitos.
 */
export type NfeKeyInput = {
  cUF: string;
  aamm: string;
  cnpj: string;
  mod: "55" | "65";
  serie: string;
  nNF: string;
  tpEmis: string;
  cNF: string;
};

export type GeneratedNfeKey = { chave: string; idXml: string };

const DIGITS = /^\d+$/;

function assertDigits(name: string, value: string, length: number): void {
  if (!DIGITS.test(value) || value.length !== length) {
    throw new TypeError(`${name} deve conter exatamente ${length} dígitos.`);
  }
}

function assertPaddedDigits(name: string, value: string, maxLength: number): string {
  if (!DIGITS.test(value) || value.length < 1 || value.length > maxLength) {
    throw new TypeError(`${name} deve conter de 1 a ${maxLength} dígitos.`);
  }
  return value.padStart(maxLength, "0");
}

/** Módulo 11: pesos de 2 a 9 da direita para a esquerda; restos 0/1 geram DV 0. */
export function generateNfeKey(input: NfeKeyInput): GeneratedNfeKey {
  assertDigits("cUF", input.cUF, 2);
  assertDigits("aamm", input.aamm, 4);
  const month = Number(input.aamm.slice(2, 4));
  if (month < 1 || month > 12) {
    throw new TypeError("aamm deve conter um mês válido entre 01 e 12.");
  }
  assertDigits("CNPJ", input.cnpj, 14);
  if (input.mod !== "55" && input.mod !== "65") {
    throw new TypeError('mod deve ser "55" (NF-e) ou "65" (NFC-e).');
  }

  const serie = assertPaddedDigits("serie", input.serie, 3);
  const nNF = assertPaddedDigits("nNF", input.nNF, 9);
  assertDigits("tpEmis", input.tpEmis, 1);
  assertDigits("cNF", input.cNF, 8);

  const base = [
    input.cUF, input.aamm, input.cnpj, input.mod,
    serie, nNF, input.tpEmis, input.cNF,
  ].join("");

  if (base.length !== 43) {
    throw new Error("Erro interno: a base da chave NF-e deve ter 43 dígitos.");
  }

  let sum = 0;
  let weight = 2;
  for (let index = base.length - 1; index >= 0; index -= 1) {
    sum += Number(base[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }

  const remainder = sum % 11;
  const candidate = 11 - remainder;
  const dv = candidate === 10 || candidate === 11 ? "0" : String(candidate);
  const chave = base + dv;

  if (chave.length !== 44) {
    throw new Error("Erro interno: a chave NF-e deve ter 44 dígitos.");
  }
  return { chave, idXml: `NFe${chave}` };
}
