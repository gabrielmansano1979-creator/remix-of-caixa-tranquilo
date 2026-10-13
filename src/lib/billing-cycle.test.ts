import { describe, expect, it } from "vitest";
import { nextBillingDate } from "./billing-cycle";

describe("next Asaas billing date", () => {
  it("uses the local date in São Paulo, not the server's UTC date", () => {
    expect(nextBillingDate("2026-10-14T02:00:00.000Z", "month")).toBe("2026-11-13");
  });

  it("advances monthly dates and clamps month-end safely", () => {
    expect(nextBillingDate("2026-01-31T15:00:00.000Z", "month")).toBe("2026-02-28");
    expect(nextBillingDate("2028-01-31T15:00:00.000Z", "month")).toBe("2028-02-29");
    expect(nextBillingDate("2026-03-31T15:00:00.000Z", "month")).toBe("2026-04-30");
  });

  it("advances yearly dates including leap-day payment dates", () => {
    expect(nextBillingDate("2028-02-29T15:00:00.000Z", "year")).toBe("2029-02-28");
    expect(nextBillingDate("2026-10-13T15:00:00.000Z", "year")).toBe("2027-10-13");
  });

  it("rejects invalid dates and intervals", () => {
    expect(() => nextBillingDate("not-a-date", "month")).toThrow(RangeError);
    expect(() => nextBillingDate("2026-10-13T12:00:00Z", "week" as "month")).toThrow(RangeError);
  });
});
