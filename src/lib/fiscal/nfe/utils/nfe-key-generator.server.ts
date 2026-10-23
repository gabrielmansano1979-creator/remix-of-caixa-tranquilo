/**
 * Geração da chave de acesso NF-e/NFC-e (layout 4.00).
 * Não depende de rede, banco de dados ou estado global.
 */
export type NfeModel = "55" | "65";

export interface NfeKeyInput {
  /** Código IBGE da UF (cUF), dois dígitos. Ex.: SP = 35, RJ = 33. */
  cUF: string;
  /** Data de emissão no formato YYYY-MM-DD ou YYYY-MM. */
  issueDate: string;
  /** CNPJ do emitente, com ou sem pontuação. */
  issuerCnpj: string;
  /** Modelo fiscal: 55 (NF-e) ou 65 (NFC-e). */
  model: NfeModel;
  /** Série numérica da nota, de 0 a 999. */
  series: number;
  /** Número da nota, de 1 a 999999999. */
  invoiceNumber: number;
  /** Tipo de emissão, código oficial de um dígito (ex.: 1 = normal). */
  emissionType: string;
  /** Código numérico aleatório cNF de exatamente 8 dígitos. */
  numericCode: string;
}

export interface NfeKeyAndId {
  accessKey: string;
  infNFeId: string;
  checkDigit: string;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function assertDigits(value: string, length: number, field: string): string {
  if (!new RegExp(`^\\d{${length}}$`).test(value)) {
    throw new Error(`${field} deve conter exatamente ${length} dígitos.`);
  }
  return value;
}

/**
 * Módulo 11 da chave NF-e: pesos 2..9 da direita para a esquerda.
 * Se o resto for 0 ou 1, o DV é 0; caso contrário, DV = 11 - resto.
 */
export function calculateNfeCheckDigit(base43: string): string {
  if (!/^\d{43}$/.test(base43)) {
    throw new Error("A base da chave NF-e deve conter exatamente 43 dígitos.");
  }

  let weight = 2;
  let sum = 0;

  for (let index = base43.length - 1; index >= 0; index -= 1) {
    sum += Number(base43[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }

  const remainder = sum % 11;
  const digit = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
  return String(digit);
}

export function generateNfeKeyAndId(input: NfeKeyInput): NfeKeyAndId {
  const cUF = assertDigits(input.cUF, 2, "cUF");
  const cnpj = assertDigits(digitsOnly(input.issuerCnpj), 14, "CNPJ do emitente");

  if (!Number.isInteger(input.series) || input.series < 0 || input.series > 999) {
    throw new Error("A série deve ser um inteiro entre 0 e 999.");
  }
  if (
    !Number.isInteger(input.invoiceNumber) ||
    input.invoiceNumber < 1 ||
    input.invoiceNumber > 999_999_999
  ) {
    throw new Error("O número da nota deve ser um inteiro entre 1 e 999999999.");
  }
  if (input.model !== "55" && input.model !== "65") {
    throw new Error("Modelo fiscal inválido: utilize 55 (NF-e) ou 65 (NFC-e).");
  }

  const dateMatch = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(input.issueDate);
  if (!dateMatch) {
    throw new Error("issueDate deve estar no formato YYYY-MM-DD ou YYYY-MM.");
  }
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const dayText = input.issueDate.length === 10 ? input.issueDate.slice(8, 10) : undefined;
  if (year < 2000 || year > 2099 || month < 1 || month > 12) {
    throw new Error("A data de emissão não produz um AAMM válido para a chave.");
  }
  if (dayText !== undefined) {
    const day = Number(dayText);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day < 1 || day > daysInMonth) {
      throw new Error("O dia informado em issueDate não é válido para o mês.");
    }
  }

  const emissionType = assertDigits(input.emissionType, 1, "tpEmis");
  const numericCode = assertDigits(input.numericCode, 8, "cNF");
  const aamm = `${String(year).slice(-2)}${String(month).padStart(2, "0")}`;

  const base43 = [
    cUF,
    aamm,
    cnpj,
    input.model,
    String(input.series).padStart(3, "0"),
    String(input.invoiceNumber).padStart(9, "0"),
    emissionType,
    numericCode,
  ].join("");

  if (base43.length !== 43) {
    throw new Error("Falha interna: a composição da chave-base não contém 43 dígitos.");
  }

  const checkDigit = calculateNfeCheckDigit(base43);
  const accessKey = base43 + checkDigit;

  return {
    accessKey,
    infNFeId: `NFe${accessKey}`,
    checkDigit,
  };
}
