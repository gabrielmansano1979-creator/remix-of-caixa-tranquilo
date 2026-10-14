import { describe, expect, it } from "vitest";
import { calculateCommissionAmountCents, commissionRateForConfirmedClients } from "./affiliate-commission";

describe("affiliate commission tiers", () => {
  it.each([
    [0, 20],
    [1, 20],
    [5, 20],
    [6, 25],
    [15, 25],
    [16, 30],
    [30, 30],
    [31, 30],
    [100, 30],
  ] as const)("uses %i confirmed clients -> %i percent", (clients, rate) => {
    expect(commissionRateForConfirmedClients(clients)).toBe(rate);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid client count %s", (clients) => {
    expect(() => commissionRateForConfirmedClients(clients)).toThrow(RangeError);
  });
});

describe("affiliate commission cents", () => {
  it.each([
    [1, 20, 0],
    [5, 20, 1],
    [999, 25, 249],
    [12345, 20, 2469],
    [12345, 25, 3086],
    [12345, 30, 3703],
  ] as const)("calculates %i cents at %i percent -> %i cents", (amount, rate, expected) => {
    expect(calculateCommissionAmountCents(amount, rate)).toBe(expected);
  });

  it("calculates commission on the discounted amount actually paid", () => {
    const listPriceCents = 10_000;
    const discountPercent = 20;
    const actualPaidCents = Math.round(listPriceCents * (1 - discountPercent / 100));

    expect(actualPaidCents).toBe(8_000);
    expect(calculateCommissionAmountCents(actualPaidCents, 20)).toBe(1_600);
    expect(calculateCommissionAmountCents(actualPaidCents, 25)).toBe(2_000);
    expect(calculateCommissionAmountCents(actualPaidCents, 30)).toBe(2_400);
  });

  it("remains exact for very large safe-integer payment amounts", () => {
    const amount = Number.MAX_SAFE_INTEGER;
    for (const rate of [20, 25, 30] as const) {
      expect(calculateCommissionAmountCents(amount, rate)).toBe(Number((BigInt(amount) * BigInt(rate)) / 100n));
    }
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid payment cents %s", (amount) => {
    expect(() => calculateCommissionAmountCents(amount, 20)).toThrow(RangeError);
  });
});
