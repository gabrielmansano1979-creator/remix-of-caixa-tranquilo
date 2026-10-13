import { describe, expect, it } from "vitest";
import { commissionRateForConfirmedClients } from "./affiliate-commission";

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
