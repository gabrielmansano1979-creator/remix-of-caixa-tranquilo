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
 * Calculates the commission from an integer amount in cents without multiplying
 * the full payment amount by the percentage first. The result is rounded down to
 * the nearest cent, matching the billing contract.
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

  const wholeHundreds = Math.trunc(paymentAmountCents / 100);
  const remainderCents = paymentAmountCents % 100;
  const wholeCommission = wholeHundreds * commissionPercent;
  const fractionalCommission = Math.trunc((remainderCents * commissionPercent) / 100);
  const result = wholeCommission + fractionalCommission;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError("commission result exceeds exact integer precision");
  }
  return result;
}
