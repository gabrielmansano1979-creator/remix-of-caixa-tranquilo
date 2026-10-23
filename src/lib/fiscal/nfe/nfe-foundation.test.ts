import { describe, expect, it } from "vitest";
import { getNfeSoapEndpoint, isNfeUfSupported } from "./sefaz-urls.server";
import { buildNfeXmlSkeleton } from "./nfe-xml-generator.server";

const key55 = "35261012345678000195550010000000011000000010";
const key65 = "35261012345678000195650010000000011000000010";

describe("NF-e SOAP endpoint registry", () => {
  it("returns homologation and production endpoints for SP", () => {
    expect(getNfeSoapEndpoint("SP", 2, "NfeAutorizacao4")).toContain("homologacao.nfe.fazenda.sp.gov.br");
    expect(getNfeSoapEndpoint("SP", 1, "NfeRetAutorizacao4")).toBe(
      "https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
    );
  });

  it("routes MA to SVAN and RJ to SVRS", () => {
    expect(getNfeSoapEndpoint("MA", 2, "NfeAutorizacao4")).toContain("hom.sefazvirtual.fazenda.gov.br");
    expect(getNfeSoapEndpoint("RJ", 1, "NfeAutorizacao4")).toContain("nfe.svrs.rs.gov.br");
  });

  it("fails closed for an unconfigured state authorizer", () => {
    expect(isNfeUfSupported("BA")).toBe(false);
    expect(() => getNfeSoapEndpoint("BA", 1, "NfeAutorizacao4")).toThrow(/ainda não foi configurado/i);
  });
});

describe("NF-e XML scaffold", () => {
  it("uses the official namespace and embeds the 44-digit access key in infNFe@Id", () => {
    const xml = buildNfeXmlSkeleton({ accessKey: key55, model: "55", environment: 2 });
    expect(xml).toContain('xmlns="http://www.portalfiscal.inf.br/nfe"');
    expect(xml).toContain('Id="NFe' + key55 + '"');
    expect(xml).toContain("<mod>55</mod>");
    expect(xml).toContain("<tpAmb>2</tpAmb>");
  });

  it("supports NFC-e model 65 when the access key agrees", () => {
    expect(buildNfeXmlSkeleton({ accessKey: key65, model: "65" })).toContain("<mod>65</mod>");
  });

  it("rejects malformed keys and model mismatches", () => {
    expect(() => buildNfeXmlSkeleton({ accessKey: "123" })).toThrow(/44 dígitos/);
    expect(() => buildNfeXmlSkeleton({ accessKey: key55, model: "65" })).toThrow(/não corresponde/);
  });
});
