import { describe, expect, it } from "vitest";
import { isValidCpfCnpj, isValidCrcNumber, normalizeCpfCnpj } from "./identity";

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

  it("accepts Receita Federal's alphanumeric CNPJ and preserves letters during normalization", () => {
    expect(isValidCpfCnpj("12.ABC.345/01DE-35")).toBe(true);
    expect(normalizeCpfCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
  });

  it("rejects alphanumeric CNPJ with invalid check digits or letters in the check-digit positions", () => {
    expect(isValidCpfCnpj("12.ABC.345/01DE-36")).toBe(false);
    expect(isValidCpfCnpj("12.ABC.345/01DE-A5")).toBe(false);
    expect(isValidCpfCnpj("12.ABC.345/01D--")).toBe(false);
  });

  it("rejects values with unsupported lengths", () => {
    expect(isValidCpfCnpj("1234567890")).toBe(false);
    expect(isValidCpfCnpj("123456789012345")).toBe(false);
  });
});


describe("CFC/CRC professional registration number format", () => {
  it("accepts primary origin and provisional registration formats", () => {
    expect(isValidCrcNumber("SP-123456/O-3")).toBe(true);
    expect(isValidCrcNumber("TO-654321/P-8")).toBe(true);
  });

  it("accepts transferred and secondary registration suffixes", () => {
    expect(isValidCrcNumber("SP-123456/O-3 T-MG")).toBe(true);
    expect(isValidCrcNumber("PI-111222/O-5 S-AC")).toBe(true);
  });

  it("rejects missing registration type/check digit and malformed suffixes", () => {
    expect(isValidCrcNumber("SP-123456/O")).toBe(false);
    expect(isValidCrcNumber("SP-123456/O-")).toBe(false);
    expect(isValidCrcNumber("SP-123456/O-3 garbage")).toBe(false);
  });
});
