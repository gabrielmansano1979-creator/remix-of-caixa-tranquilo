export type BillingInterval = "month" | "year";

/**
 * Returns the next calendar due date based on the date in São Paulo when
 * payment was confirmed. Month/year-end dates are clamped to the last day
 * of the target month (for example, Jan 31 -> Feb 28).
 */
export function nextBillingDate(paidAt: string | Date, interval: BillingInterval): string {
  const instant = paidAt instanceof Date ? paidAt : new Date(paidAt);
  if (!Number.isFinite(instant.getTime())) {
    throw new RangeError("paidAt must be a valid date");
  }
  if (interval !== "month" && interval !== "year") {
    throw new RangeError("interval must be month or year");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value;
  const year = Number(part("year"));
  const month = Number(part("month"));
  const day = Number(part("day"));
  if (![year, month, day].every(Number.isInteger)) {
    throw new RangeError("could not resolve São Paulo billing date");
  }

  const monthOffset = interval === "month" ? 1 : 12;
  const targetMonthIndex = month - 1 + monthOffset;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = (targetMonthIndex % 12) + 1;
  const targetLastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(day, targetLastDay);

  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}
