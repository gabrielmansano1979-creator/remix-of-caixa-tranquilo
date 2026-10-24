import { describe, expect, it } from "vitest";
import {
  calculateCurrentBalanceCents,
  calculateProjectedBalancesCents,
  type CashMovementForMath,
} from "./cash-projection-math";

const movement = (values: Partial<CashMovementForMath> & Pick<CashMovementForMath, "type" | "amount_cents" | "due_date" | "status">): CashMovementForMath => ({
  paid_at: null,
  ...values,
});

describe("cash movement arithmetic", () => {
  it("adds income and subtracts expenses from actual cash only after payment confirmation", () => {
    const entries = [
      movement({ type: "income", amount_cents: 15000, due_date: "2026-10-14", status: "paid", paid_at: "2026-10-13T12:00:00-03:00" }),
      movement({ type: "expense", amount_cents: 5000, due_date: "2026-10-14", status: "paid", paid_at: "2026-10-13T13:00:00-03:00" }),
      movement({ type: "income", amount_cents: 9000, due_date: "2026-10-14", status: "pending" }),
      movement({ type: "expense", amount_cents: 3000, due_date: "2026-10-14", status: "pending" }),
    ];
    expect(calculateCurrentBalanceCents(20000, "2026-10-13T10:00:00-03:00", entries)).toBe(30000);
  });

  it("keeps pending movements out of current cash but includes them in the graph forecast", () => {
    const entries = [
      movement({ type: "income", amount_cents: 5000, due_date: "2026-10-13", status: "pending" }),
      movement({ type: "expense", amount_cents: 8000, due_date: "2026-10-14", status: "pending" }),
      movement({ type: "expense", amount_cents: 4000, due_date: "2026-10-14", status: "paid", paid_at: "2026-10-13T12:00:00-03:00" }),
    ];
    const current = calculateCurrentBalanceCents(10000, "2026-10-13T10:00:00-03:00", entries);
    const projection = calculateProjectedBalancesCents(current, entries, "2026-10-13", 2);
    expect(current).toBe(6000);
    expect(projection).toEqual([
      { date: "2026-10-13", balance_cents: 11000 },
      { date: "2026-10-14", balance_cents: 3000 },
      { date: "2026-10-15", balance_cents: 3000 },
    ]);
  });

  it("moves overdue pending expenses to today's projection without changing actual cash", () => {
    const entries = [
      movement({ type: "expense", amount_cents: 2500, due_date: "2026-10-10", status: "pending" }),
    ];
    expect(calculateCurrentBalanceCents(7000, "2026-10-13T08:00:00-03:00", entries)).toBe(7000);
    expect(calculateProjectedBalancesCents(7000, entries, "2026-10-13", 1)).toEqual([
      { date: "2026-10-13", balance_cents: 4500 },
      { date: "2026-10-14", balance_cents: 4500 },
    ]);
  });

  it("does not double-count a legacy paid movement already in the date-only opening snapshot", () => {
    const legacyPaid = movement({
      type: "income",
      amount_cents: 10000,
      due_date: "2026-10-13",
      status: "paid",
      paid_at: null,
    });
    // Legacy snapshots are backfilled to the next São Paulo midnight (03:00 UTC),
    // so a movement dated on the snapshot day must not be added a second time.
    expect(calculateCurrentBalanceCents(7000, "2026-10-14T03:00:00.000Z", [legacyPaid])).toBe(7000);
  });

  it("does not double-count a payment already included in the opening-balance snapshot", () => {
    const entries = [
      movement({ type: "income", amount_cents: 20000, due_date: "2026-10-12", status: "paid", paid_at: "2026-10-12T12:00:00-03:00" }),
    ];
    expect(calculateCurrentBalanceCents(50000, "2026-10-13T08:00:00-03:00", entries)).toBe(50000);
  });

  it("moves a pending income to actual cash when it becomes paid without projecting it twice", () => {
    const pending = movement({ type: "income", amount_cents: 12000, due_date: "2026-10-13", status: "pending" });
    expect(calculateCurrentBalanceCents(4000, "2026-10-13T08:00:00-03:00", [pending])).toBe(4000);
    const paid = { ...pending, status: "paid" as const, paid_at: "2026-10-13T10:00:00-03:00" };
    const current = calculateCurrentBalanceCents(4000, "2026-10-13T08:00:00-03:00", [paid]);
    expect(current).toBe(16000);
    expect(calculateProjectedBalancesCents(current, [paid], "2026-10-13", 1)).toEqual([
      { date: "2026-10-13", balance_cents: 16000 },
      { date: "2026-10-14", balance_cents: 16000 },
    ]);
  });

  it("rejects current-balance totals beyond exact integer precision", () => {
    expect(() => calculateCurrentBalanceCents(Number.MAX_SAFE_INTEGER - 100, "2026-10-13T08:00:00Z", [
      movement({ type: "income", amount_cents: 200, due_date: "2026-10-14", status: "paid", paid_at: "2026-10-13T11:00:00Z" }),
    ])).toThrow(RangeError);
  });

  it("rejects daily-flow totals beyond exact integer precision", () => {
    expect(() => calculateProjectedBalancesCents(0, [
      movement({ type: "income", amount_cents: Number.MAX_SAFE_INTEGER, due_date: "2026-10-14", status: "pending" }),
      movement({ type: "income", amount_cents: 1, due_date: "2026-10-14", status: "pending" }),
    ], "2026-10-13", 2)).toThrow(RangeError);
  });

  it("rejects projected balances beyond exact integer precision", () => {
    expect(() => calculateProjectedBalancesCents(Number.MAX_SAFE_INTEGER, [
      movement({ type: "income", amount_cents: 1, due_date: "2026-10-13", status: "pending" }),
    ], "2026-10-13", 1)).toThrow(RangeError);
  });

  it("returns exact inclusive date ranges for 30, 60 and 90 day projections", () => {
    const cases = [
      { days: 30, points: 31, lastDate: "2026-01-31" },
      { days: 60, points: 61, lastDate: "2026-03-02" },
      { days: 90, points: 91, lastDate: "2026-04-01" },
    ];
    for (const item of cases) {
      const projection = calculateProjectedBalancesCents(12345, [], "2026-01-01", item.days);
      expect(projection).toHaveLength(item.points);
      expect(projection[0]).toEqual({ date: "2026-01-01", balance_cents: 12345 });
      expect(projection.at(-1)).toEqual({ date: item.lastDate, balance_cents: 12345 });
    }
  });

  it("rejects invalid projection horizons and non-integer monetary amounts", () => {
    expect(() => calculateProjectedBalancesCents(0, [], "2026-10-13", 91)).toThrow(RangeError);
    expect(() => calculateCurrentBalanceCents(0, "2026-10-13T10:00:00Z", [
      movement({ type: "income", amount_cents: 1.5, due_date: "2026-10-14", status: "paid", paid_at: "2026-10-13T11:00:00Z" }),
    ])).toThrow(RangeError);
  });
});
