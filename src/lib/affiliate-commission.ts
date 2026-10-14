/**
 * Commission percentage for the lifetime count of distinct referred users
 * with at least one confirmed payment.
 */
export function commissionRateForConfirmedClients(confirmedClients: number): 20 | 25 | 30 {
  if (!Number.isSafeInteger(confirmedClients) || confirmedClients < 0) {
    throw new RangeError("confirmedClients must be a non-negative integer");
  }
  if (confirmedClients <= 5) return 20;
  if (confirmedClients <= 15) return 25;
  return 30;
}

/**
 * Calculates commission on the amount actually paid, using integer cents only.
 * Fractions of a cent are rounded half-up to the nearest cent (not always down),
 * avoiding systematic underpayment over many transactions.
 */
export function calculateCommissionAmountCents(
  paymentAmountCents: number,
  commissionPercent: 20 | 25 | 30,
): number {
  if (!Number.isSafeInteger(paymentAmountCents) || paymentAmountCents < 0) {
    throw new RangeError("paymentAmountCents must be a non-negative safe integer");
  }
  if (commissionPercent !== 20 && commissionPercent !== 25 && commissionPercent !== 30) {
    throw new RangeError("commissionPercent must be 20, 25, or 30");
  }

  const result = (BigInt(paymentAmountCents) * BigInt(commissionPercent) + 50n) / 100n;
  const roundedCents = Number(result);
  if (!Number.isSafeInteger(roundedCents)) {
    throw new RangeError("commission result exceeds exact integer precision");
  }
  return roundedCents;
}
