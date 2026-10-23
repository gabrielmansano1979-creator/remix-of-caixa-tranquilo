/**
 * NF-e/NFC-e SOAP 4.00 endpoint registry.
 * Environment 1 = production; environment 2 = homologation.
 * URLs verified against official NF-e/state portals on 2026-10-23.
 *
 * Sources:
 * - https://www.nfe.fazenda.gov.br/portal/webServices.aspx
 * - https://hom.nfe.fazenda.gov.br/portal/WebServices.aspx
 * - https://portalsped.fazenda.mg.gov.br/spedmg/nfe/webservices/
 * - https://portal.fazenda.sp.gov.br/servicos/nfe/Paginas/URL-WEBSERVICES.aspx
 */
export type NfeEnvironment = 1 | 2;
export type NfeSoapService = "NfeAutorizacao4" | "NfeRetAutorizacao4";
export type Uf =
  | "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO"
  | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI"
  | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO";

type EndpointPair = Record<NfeEnvironment, Record<NfeSoapService, string>>;
type Provider = "SEFAZ_SP" | "SEFAZ_MG" | "SVRS" | "SVAN";

const PROVIDER_ENDPOINTS: Record<Provider, EndpointPair> = {
  SEFAZ_SP: {
    1: {
      NfeAutorizacao4: "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
      NfeRetAutorizacao4: "https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
    },
    2: {
      NfeAutorizacao4: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
      NfeRetAutorizacao4: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
    },
  },
  SEFAZ_MG: {
    1: {
      NfeAutorizacao4: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
      NfeRetAutorizacao4: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4",
    },
    2: {
      NfeAutorizacao4: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
      NfeRetAutorizacao4: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4",
    },
  },
  SVRS: {
    1: {
      NfeAutorizacao4: "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
      NfeRetAutorizacao4: "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    },
    2: {
      NfeAutorizacao4: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
      NfeRetAutorizacao4: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    },
  },
  SVAN: {
    1: {
      NfeAutorizacao4: "https://www.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx",
      NfeRetAutorizacao4: "https://www.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
    },
    2: {
      NfeAutorizacao4: "https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx",
      NfeRetAutorizacao4: "https://hom.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
    },
  },
};

/**
 * SVRS covers the listed UFs for general NF-e services; MA uses SVAN.
 * Other states with their own authorizers must be added from official sources
 * before they can be enabled here.
 */
const UF_PROVIDER: Partial<Record<Uf, Provider>> = {
  SP: "SEFAZ_SP",
  MG: "SEFAZ_MG",
  MA: "SVAN",
  AC: "SVRS", AL: "SVRS", AP: "SVRS", CE: "SVRS", DF: "SVRS",
  ES: "SVRS", PA: "SVRS", PB: "SVRS", PI: "SVRS", RJ: "SVRS",
  RN: "SVRS", RO: "SVRS", RR: "SVRS", RS: "SVRS", SC: "SVRS",
  SE: "SVRS", TO: "SVRS",
};

export function getNfeSoapEndpoint(
  uf: Uf,
  environment: NfeEnvironment,
  service: NfeSoapService,
): string {
  if (environment !== 1 && environment !== 2) {
    throw new Error("Ambiente NF-e inválido: use 1 (produção) ou 2 (homologação).");
  }
  const provider = UF_PROVIDER[uf];
  if (!provider) {
    throw new Error(
      "O autorizador NF-e de " + uf +
      " ainda não foi configurado. Consulte o Portal Nacional antes de habilitar esta UF.",
    );
  }
  return PROVIDER_ENDPOINTS[provider][environment][service];
}

export function isNfeUfSupported(uf: string): uf is Uf {
  return Object.prototype.hasOwnProperty.call(UF_PROVIDER, uf);
}
