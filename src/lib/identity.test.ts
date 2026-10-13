import { describe, expect, it } from "vitest";
import { isValidCpfCnpj } from "./identity";

describe("Brazilian CPF/CNPJ shape validation", () => {
  it("accepts a CPF with valid check digits, with or without punctuation", () => {
    expect(isValidCpfCnpj("52998224725")).toBe(true);
    expect(isValidCpfCnpj("529.982.247-25")).toBe(true);
  });

  it("rejects a CPF with an invalid check digit and repeated digits", () => {
    expect(isValidCpfCnpj("52998224724")).toBe(false);
    expect(isValidCpfCnpj("111.111.111-11")).toBe(false);
  });

  it("accepts a CNPJ with valid check digits, with or without punctuation", () => {
    expect(isValidCpfCnpj("11222333000181")).toBe(true);
    expect(isValidCpfCnpj("11.222.333/0001-81")).toBe(true);
  });

  it("rejects a CNPJ with an invalid check digit and repeated digits", () => {
    expect(isValidCpfCnpj("11222333000180")).toBe(false);
    expect(isValidCpfCnpj("11.111.111/1111-11")).toBe(false);
  });

  it("rejects values with unsupported lengths", () => {
    expect(isValidCpfCnpj("1234567890")).toBe(false);
    expect(isValidCpfCnpj("123456789012345")).toBe(false);
  });
});
