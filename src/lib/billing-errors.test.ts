import { describe, expect, it } from "vitest";
import { checkoutErrorMessage } from "./billing-errors";
import { AsaasApiError } from "./asaas.server";

describe("safe PIX checkout error messages", () => {
  it("explains invalid CPF/CNPJ without exposing the provider response", () => {
    const error = new AsaasApiError(400, "invalid_cpfCnpj", "POST /payments", "CPF/CNPJ recusado");

    expect(checkoutErrorMessage(error)).toContain("CPF ou CNPJ");
    expect(checkoutErrorMessage(error)).not.toContain("invalid_cpfCnpj");
    expect(checkoutErrorMessage(error)).not.toContain("CPF/CNPJ recusado");
  });

  it("maps a rejected due date to an actionable safe message", () => {
    const error = new AsaasApiError(400, "invalid_dueDate", "POST /payments", "Vencimento recusado");

    expect(checkoutErrorMessage(error)).toContain("vencimento");
    expect(checkoutErrorMessage(error)).not.toContain("invalid_dueDate");
  });

  it("asks the user to retry after provider rate limiting", () => {
    expect(checkoutErrorMessage(new AsaasApiError(429, "provider_rejected", "POST /payments", "safe")))
      .toContain("muitas solicitações");
  });

  it("does not leak internal details for unknown provider errors", () => {
    const error = new Error("ASAAS_500:private_provider_payload");

    expect(checkoutErrorMessage(error)).toContain("não concluiu o Pix");
    expect(checkoutErrorMessage(error)).not.toContain("private_provider_payload");
  });

  it("handles uncertain payment creation without encouraging duplicate charges", () => {
    expect(checkoutErrorMessage(new Error("PIX_CREATE_STATUS_UNKNOWN:internal details")))
      .toContain("cobrança existente será verificada");
  });

  it("explains a missing QR code while directing the user to recover the same charge", () => {
    expect(checkoutErrorMessage(new Error("PIX_QR_UNAVAILABLE")))
      .toContain("recuperar o Pix");
  });

  it("reports schema and permission issues without leaking database internals", () => {
    expect(checkoutErrorMessage({ code: "PGRST205", message: "missing table details" }))
      .toContain("estrutura de cobrança");
    expect(checkoutErrorMessage({ code: "42501", message: "permission denied details" }))
      .toContain("permissões");
    expect(checkoutErrorMessage({ code: "PGRST205", message: "missing table details" }))
      .not.toContain("missing table details");
  });
});
