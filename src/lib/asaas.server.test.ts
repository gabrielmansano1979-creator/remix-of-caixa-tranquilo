import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelAsaasSubscription,
  createOrGetPixSubscription,
  createPixCharge,
  type AsaasBillingCycle,
} from "./asaas.server";

const sandboxKey = "$aact_hmlg_unit_test";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Asaas recurring PIX API contract", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("ASAAS_API_KEY", sandboxKey);
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("creates a monthly PIX subscription after checking the stable external reference", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [] }))
      .mockResolvedValueOnce(jsonResponse({
        id: "sub_unit_123",
        externalReference: "cc-renewal-checkout_123",
        status: "ACTIVE",
      }));

    const result = await createOrGetPixSubscription(
      "cus_unit_123",
      5900,
      "2026-11-13",
      "MONTHLY",
      "cc-renewal-checkout_123",
      "Critical Cash Pro mensal — renovação",
    );

    expect(result).toEqual({
      id: "sub_unit_123",
      externalReference: "cc-renewal-checkout_123",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [lookupUrl] = fetchMock.mock.calls[0];
    expect(String(lookupUrl)).toContain("/subscriptions?externalReference=cc-renewal-checkout_123&limit=100");

    const [createUrl, createOptions] = fetchMock.mock.calls[1];
    expect(String(createUrl)).toBe("https://api-sandbox.asaas.com/v3/subscriptions");
    expect(createOptions?.method).toBe("POST");
    const payload = JSON.parse(String(createOptions?.body)) as Record<string, unknown>;
    expect(payload).toMatchObject({
      customer: "cus_unit_123",
      billingType: "PIX",
      value: 59,
      nextDueDate: "2026-11-13",
      cycle: "MONTHLY",
      externalReference: "cc-renewal-checkout_123",
    });
  });

  it("recovers a charge by external reference without creating a new payment", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      data: [{
        id: "pay_recovered_123",
        status: "PENDING",
        externalReference: "cc_checkout_stable_ref",
        value: 59,
      }],
    }));

    const result = await (await import("./asaas.server")).findPaymentByExternalReference("cc_checkout_stable_ref");

    expect(result).toEqual({
      id: "pay_recovered_123",
      status: "PENDING",
      externalReference: "cc_checkout_stable_ref",
      value: 59,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/payments?externalReference=cc_checkout_stable_ref&limit=100",
    );
  });

  it("reuses the existing active recurrence after a retry instead of creating a duplicate", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      data: [{
        id: "sub_existing",
        externalReference: "cc-renewal-same-reference",
        status: "ACTIVE",
      }],
    }));

    const result = await createOrGetPixSubscription(
      "cus_unit_123",
      2900,
      "2026-11-13",
      "YEARLY" as AsaasBillingCycle,
      "cc-renewal-same-reference",
      "Critical Cash Starter anual",
    );

    expect(result.id).toBe("sub_existing");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
  });

  it("rejects unsafe amounts and malformed due dates without calling the API", async () => {
    await expect(createOrGetPixSubscription(
      "cus_unit_123",
      Number.MAX_SAFE_INTEGER + 1,
      "2026-11-13",
      "MONTHLY",
      "reference-overflow",
      "Critical Cash",
    )).rejects.toThrow(RangeError);

    await expect(createOrGetPixSubscription(
      "cus_unit_123",
      5900,
      "2026-02-30",
      "MONTHLY",
      "reference-invalid-date",
      "Critical Cash",
    )).rejects.toThrow(RangeError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats an already removed recurrence as successfully canceled on retry", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ errors: [{ description: "not found" }] }, 404));

    await expect(cancelAsaasSubscription("sub_already_removed")).resolves.toEqual({
      deleted: true,
      alreadyRemoved: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api-sandbox.asaas.com/v3/subscriptions/sub_already_removed");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it("sends a PIX charge due today, never a date in the past", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T01:30:00Z"));
    try {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ id: "pay_unit_456", value: 59 }))
        .mockResolvedValueOnce(jsonResponse({ encodedImage: "00020126", payload: "0002012608" }));

      const result = await createPixCharge("cus_unit_123", 5900, "cc_checkout_ref", "Critical Cash Pro mensal");

      expect(result).toEqual({
        id: "pay_unit_456",
        pixQrCode: "00020126",
        pixCopyAndPaste: "0002012608",
        value: 59,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(String(fetchMock.mock.calls[0][0])).toBe("https://api-sandbox.asaas.com/v3/payments");

      const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;
      const dueDate = String(payload.dueDate);
      // 01:30 UTC = 22:30 do dia 13 em Brasília: o vencimento segue o dia de Brasília.
      expect(dueDate).toBe("2026-10-13");
      expect(dueDate >= new Date("2026-10-13T01:30:00Z").toISOString().slice(0, 10)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the Brasília calendar date late at night instead of the UTC next day", async () => {
    vi.useFakeTimers();
    // 23:30 em Brasília (02:30 UTC do dia seguinte): o vencimento deve ser o dia de Brasília.
    vi.setSystemTime(new Date("2026-10-15T02:30:00Z"));
    try {
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ id: "pay_unit_789", value: 59 }))
        .mockResolvedValueOnce(jsonResponse({ encodedImage: "00020126", payload: "0002012608" }));

      await createPixCharge("cus_unit_123", 5900, "cc_checkout_ref_brt", "Critical Cash Pro mensal");

      const payload = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as Record<string, unknown>;
      expect(payload.dueDate).toBe("2026-10-14");
    } finally {
      vi.useRealTimers();
    }
  });
});
