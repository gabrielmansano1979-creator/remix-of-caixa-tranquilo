/**
 * Geração da chave de acesso da NF-e/NFC-e (modelo 55/65).
 */
export type NfeKeyInput = {
  /** Código IBGE da UF, exatamente 2 dígitos. */
  uf: string;
  /** Ano/mês no formato AAMM, exatamente 4 dígitos. */
  aamm: string;
  /** CNPJ do emitente, somente dígitos (14 posições). */
  cnpj: string;
  /** 55 = NF-e; 65 = NFC-e. */
  modelo: "55" | "65";
  /** Série com 3 dígitos, incluindo zeros à esquerda. */
  serie: string;
  /** Número da nota com 9 dígitos, incluindo zeros à esquerda. */
  numero: string;
  /** Tipo de emissão, um dígito. */
  tipoEmissao: string;
  /** Código numérico com 8 dígitos, incluindo zeros à esquerda. */
  codigoNumerico: string;
};

export type NfeKeyResult = {
  /** Chave de acesso completa com 44 dígitos. */
  chave: string;
  /** Valor do atributo Id de infNFe, incluindo o prefixo NFe. */
  id: string;
};

const DIGITS = /^\d+$/;

function assertDigits(name: string, value: string, length: number): void {
  if (typeof value !== "string" || value.length !== length || !DIGITS.test(value)) {
    throw new TypeError(`${name} deve conter exatamente ${length} dígitos numéricos.`);
  }
}

/**
 * Calcula o DV por módulo 11, da direita para a esquerda, repetindo pesos 2..9.
 * Restos 0 ou 1 resultam em DV 0.
 */
export function calculateNfeCheckDigit(base43: string): string {
  assertDigits("base43", base43, 43);

  let weight = 2;
  let sum = 0;

  for (let index = base43.length - 1; index >= 0; index -= 1) {
    sum += Number(base43[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }

  const remainder = sum % 11;
  const calculated = 11 - remainder;
  return calculated === 10 || calculated === 11 ? "0" : String(calculated);
}

/** Função determinística e sem efeitos colaterais para gerar chave e Id XML. */
export function generateNfeKey(input: NfeKeyInput): NfeKeyResult {
  if (input.modelo !== "55" && input.modelo !== "65") {
    throw new TypeError("Modelo deve ser 55 (NF-e) ou 65 (NFC-e).");
  }

  assertDigits("UF", input.uf, 2);
  assertDigits("AAMM", input.aamm, 4);
  assertDigits("CNPJ", input.cnpj, 14);
  assertDigits("série", input.serie, 3);
  assertDigits("número da nota", input.numero, 9);
  assertDigits("tipo de emissão", input.tipoEmissao, 1);
  assertDigits("código numérico", input.codigoNumerico, 8);

  const month = Number(input.aamm.slice(2, 4));
  if (month < 1 || month > 12) {
    throw new RangeError("AAMM contém um mês inválido; o mês deve estar entre 01 e 12.");
  }

  const base43 = [
    input.uf,
    input.aamm,
    input.cnpj,
    input.modelo,
    input.serie,
    input.numero,
    input.tipoEmissao,
    input.codigoNumerico,
  ].join("");

  if (base43.length !== 43) {
    throw new Error("Falha interna na composição da chave de acesso da NF-e.");
  }

  const chave = base43 + calculateNfeCheckDigit(base43);
  return { chave, id: `NFe${chave}` };
}
