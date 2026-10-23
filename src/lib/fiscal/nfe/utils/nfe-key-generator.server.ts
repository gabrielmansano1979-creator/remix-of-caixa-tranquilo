/**
 * NF-e/NFC-e access-key generation (44 digits), based on the SPED/MOC layout.
 * Pure function: it performs no I/O and does not allocate the invoice number.
 */

export type NfeModel = "55" | "65";

export interface NfeKeyInput {
  /** IBGE issuer state code, two digits (e.g. "33" for RJ). */
  cUF: string;
  /** Year and month of issuance, YYMM. */
  aamm: string;
  /** Issuer CNPJ, 14 digits. */
  cnpj: string;
  /** 55 = NF-e; 65 = NFC-e. */
  model: NfeModel;
  /** Series, 1–3 digits; left-padded to 3. */
  series: string | number;
  /** Invoice number, 1–9 digits; left-padded to 9. */
  invoiceNumber: string | number;
  /** Emission type, one digit (normally "1"). */
  emissionType: string;
  /** Numeric code, exactly 8 digits. */
  numericCode: string;
}

export interface NfeKeyAndId {
  accessKey: string;
  id: string;
  checkDigit: string;
}

function digits(value: string, field: string): string {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${field} deve conter somente dígitos.`);
  }
  return value;
}

function leftPad(value: string | number, length: number, field: string): string {
  const normalized = digits(String(value), field);
  if (normalized.length > length) {
    throw new Error(`${field} deve possuir no máximo ${length} dígitos.`);
  }
  return normalized.padStart(length, "0");
}

/**
 * Calculates the NF-e access-key DV using Modulo 11 with weights 2..9
 * from right to left. A remainder of 0 or 1 produces DV 0; otherwise 11-r.
 */
export function calculateNfeCheckDigit(first43Digits: string): string {
  if (!/^\d{43}$/.test(first43Digits)) {
    throw new Error("A base da chave NF-e deve conter exatamente 43 dígitos.");
  }

  let weight = 2;
  let sum = 0;

  for (let index = first43Digits.length - 1; index >= 0; index -= 1) {
    sum += Number(first43Digits[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }

  const remainder = sum % 11;
  const digit = remainder === 0 || remainder === 1 ? 0 : 11 - remainder;
  return String(digit);
}

export function generateNfeKeyAndId(input: NfeKeyInput): NfeKeyAndId {
  const cUF = leftPad(input.cUF, 2, "cUF");
  const aamm = digits(input.aamm, "aamm");
  if (!/^\d{4}$/.test(aamm)) {
    throw new Error("aamm deve estar no formato AAMM com 4 dígitos.");
  }

  const cnpj = digits(input.cnpj, "cnpj");
  if (!/^\d{14}$/.test(cnpj)) {
    throw new Error("O CNPJ do emitente deve conter exatamente 14 dígitos.");
  }

  const model = input.model;
  if (model !== "55" && model !== "65") {
    throw new Error("O modelo da nota deve ser 55 (NF-e) ou 65 (NFC-e).");
  }

  const series = leftPad(input.series, 3, "series");
  const invoiceNumber = leftPad(input.invoiceNumber, 9, "invoiceNumber");
  const emissionType = digits(input.emissionType, "emissionType");
  if (!/^\d$/.test(emissionType)) {
    throw new Error("emissionType deve conter exatamente 1 dígito.");
  }
  const numericCode = digits(input.numericCode, "numericCode");
  if (!/^\d{8}$/.test(numericCode)) {
    throw new Error("numericCode deve conter exatamente 8 dígitos.");
  }

  const base = `${cUF}${aamm}${cnpj}${model}${series}${invoiceNumber}${emissionType}${numericCode}`;
  if (base.length !== 43) {
    throw new Error("Falha interna: a base da chave NF-e não contém 43 dígitos.");
  }

  const checkDigit = calculateNfeCheckDigit(base);
  const accessKey = `${base}${checkDigit}`;

  return {
    accessKey,
    id: `NFe${accessKey}`,
    checkDigit,
  };
}
