/**
 * Valida CPF/CNPJ brasileiro pelos dígitos verificadores.
 * Isso detecta erros de digitação, mas não consulta a situação cadastral da Receita Federal.
 */
export function isValidCpfCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (/^(\d)\1+$/.test(digits)) return false;

  if (digits.length === 11) {
    const digitAt = (length: number) => {
      const sum = digits.slice(0, length).split("").reduce(
        (total, digit, index) => total + Number(digit) * (length + 1 - index),
        0,
      );
      const remainder = (sum * 10) % 11;
      return remainder === 10 ? 0 : remainder;
    };
    return digitAt(9) === Number(digits[9]) && digitAt(10) === Number(digits[10]);
  }

  if (digits.length === 14) {
    const checkDigit = (length: number) => {
      const weights = length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const sum = digits.slice(0, length).split("").reduce(
        (total, digit, index) => total + Number(digit) * weights[index],
        0,
      );
      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };
    return checkDigit(12) === Number(digits[12]) && checkDigit(13) === Number(digits[13]);
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
