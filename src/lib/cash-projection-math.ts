export type CashMovementForMath = {
  type: "income" | "expense";
  amount_cents: number;
  due_date: string;
  status: "pending" | "paid";
  paid_at?: string | null;
};

export type CashProjectionPoint = {
  date: string;
  balance_cents: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SP_NOON_UTC_SUFFIX = "T15:00:00.000Z";

function signedAmount(entry: Pick<CashMovementForMath, "type" | "amount_cents">): number {
  if (!Number.isSafeInteger(entry.amount_cents) || entry.amount_cents < 0) {
    throw new RangeError("amount_cents must be a non-negative safe integer");
  }
  return entry.type === "income" ? entry.amount_cents : -entry.amount_cents;
}

function datePlusDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== isoDate) {
    throw new RangeError("date must be a valid YYYY-MM-DD value");
  }
  date.setTime(date.getTime() + days * DAY_MS);
  return date.toISOString().slice(0, 10);
}

/**
 * Mirrors the SQL contract: the opening balance is the manual snapshot, and only
 * paid movements confirmed after that snapshot are applied to actual cash.
 */
export function calculateCurrentBalanceCents(
  openingBalanceCents: number,
  snapshotAt: string,
  movements: CashMovementForMath[],
): number {
  if (!Number.isSafeInteger(openingBalanceCents)) {
    throw new RangeError("openingBalanceCents must be a safe integer");
  }
  const snapshotTime = Date.parse(snapshotAt);
  if (!Number.isFinite(snapshotTime)) throw new RangeError("snapshotAt must be a valid timestamp");

  return movements.reduce((balance, entry) => {
    if (entry.status !== "paid") return balance;
    // Older DATE rows are migrated to noon in São Paulo (15:00 UTC). Keep the
    // same fallback for records without a paid_at value.
    const paidAt = entry.paid_at ? Date.parse(entry.paid_at) : Date.parse(entry.due_date + SP_NOON_UTC_SUFFIX);
    if (!Number.isFinite(paidAt) || paidAt <= snapshotTime) return balance;
    return balance + signedAmount(entry);
  }, openingBalanceCents);
}

/**
 * Produces points for today through today + days (inclusive), just like the SQL RPC.
 * Pending overdue movements are assigned to today; paid movements are not projected
 * again because their amounts are already reflected in the actual balance.
 */
export function calculateProjectedBalancesCents(
  currentBalanceCents: number,
  movements: CashMovementForMath[],
  startDate: string,
  days: number,
): CashProjectionPoint[] {
  if (!Number.isSafeInteger(currentBalanceCents)) {
    throw new RangeError("currentBalanceCents must be a safe integer");
  }
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new RangeError("days must be an integer between 1 and 90");
  }
  const endDate = datePlusDays(startDate, days);
  const flows = new Map<string, number>();

  for (const entry of movements) {
    if (entry.status !== "pending" || entry.due_date > endDate) continue;
    const flowDate = entry.due_date < startDate ? startDate : entry.due_date;
    flows.set(flowDate, (flows.get(flowDate) ?? 0) + signedAmount(entry));
  }

  const points: CashProjectionPoint[] = [];
  let balance = currentBalanceCents;
  for (let offset = 0; offset <= days; offset++) {
    const date = datePlusDays(startDate, offset);
    balance += flows.get(date) ?? 0;
    points.push({ date, balance_cents: balance });
  }
  return points;
}
