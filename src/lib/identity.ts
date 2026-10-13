/**
 * Valida CPF/CNPJ brasileiro pelos dígitos verificadores.
 * Isso detecta erros de digitação, mas não consulta a situação cadastral da Receita Federal.
 */
export function normalizeCpfCnpj(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Validates CPF, legacy numeric CNPJ, and the Receita Federal alphanumeric CNPJ
 * using the official module-11 check-digit algorithm. This is mathematical
 * validation only; it does not query the official registration status.
 */
export function isValidCpfCnpj(value: string): boolean {
  const normalized = normalizeCpfCnpj(value);

  if (/^([A-Z0-9])\1+$/.test(normalized)) return false;

  if (/^\d{11}$/.test(normalized)) {
    const digitAt = (length: number) => {
      const sum = normalized.slice(0, length).split("").reduce(
        (total, digit, index) => total + Number(digit) * (length + 1 - index),
        0,
      );
      const remainder = (sum * 10) % 11;
      return remainder === 10 ? 0 : remainder;
    };
    return digitAt(9) === Number(normalized[9]) && digitAt(10) === Number(normalized[10]);
  }

  // The two check digits are always numeric; the first 12 characters may be
  // alphanumeric from the Receita Federal's July 2026 CNPJ rollout.
  if (/^[A-Z0-9]{12}\d{2}$/.test(normalized)) {
    const checkDigit = (length: number) => {
      const weights = length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const sum = normalized.slice(0, length).split("").reduce(
        (total, character, index) => total + (character.charCodeAt(0) - 48) * weights[index],
        0,
      );
      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };
    return checkDigit(12) === Number(normalized[12]) && checkDigit(13) === Number(normalized[13]);
  }

  return false;
}


/**
 * Checks the structural format used by the CFC/CRCs for professional registration numbers.
 * This is a format check only; it does not verify whether the registration is active or regular.
 */
export function isValidCrcNumber(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}-\d{6}\/[OP]-\d(?:\s+[TS]-[A-Z]{2})?$/.test(normalized);
}
