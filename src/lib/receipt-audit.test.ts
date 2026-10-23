import { describe, expect, it } from "vitest";
import { evaluateReceiptText } from "./receipt-audit";

describe("evaluateReceiptText", () => {
  it("keeps the receipt pending when the amount matches instead of auto-approving it", () => {
    const result = evaluateReceiptText("PIX recebido Valor R$ 1.200,00", 120000);
    expect(result.status).toBe("pending");
    expect(result.amountCents).toBe(120000);
  });

  it("flags a clear single-amount mismatch", () => {
    const result = evaluateReceiptText("Comprovante de pagamento Valor R$ 1.200,00", 150000);
    expect(result.status).toBe("mismatch");
    expect(result.amountCents).toBe(120000);
  });

  it("does not guess when the document has multiple amounts and none matches", () => {
    const result = evaluateReceiptText("Valor R$ 1.200,00 tarifa R$ 5,00 total R$ 1.205,00", 150000);
    expect(result.status).toBe("pending");
    expect(result.amountCents).toBeNull();
  });

  it("does not infer a value from unreadable text", () => {
    const result = evaluateReceiptText("Documento sem valor legível", 150000);
    expect(result.status).toBe("pending");
    expect(result.amountCents).toBeNull();
  });
});
