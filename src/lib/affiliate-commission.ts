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
