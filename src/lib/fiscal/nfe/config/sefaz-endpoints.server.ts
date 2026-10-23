/**
 * Endpoints dos Web Services NF-e 4.00.
 * Referência oficial: https://www.nfe.fazenda.gov.br/portal/WebServices.aspx
 * Selecione o autorizador conforme a UF e a distribuição vigente do Portal Nacional.
 */
export type NfeEnvironment = "producao" | "homologacao";
export type NfeService = "NfeAutorizacao4" | "NfeRetAutorizacao4";
export type NfeAuthority = "SP" | "MG" | "SVRS" | "SVAN";

type EnvironmentEndpoints = Readonly<Record<NfeService, string>>;
type AuthorityEndpoints = Readonly<Record<NfeEnvironment, EnvironmentEndpoints>>;

export const SEFAZ_ENDPOINTS: Readonly<Record<NfeAuthority, AuthorityEndpoints>> = {
  SP: {
    producao: {
      NfeAutorizacao4: "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
      NfeRetAutorizacao4: "https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
    },
    homologacao: {
      NfeAutorizacao4: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
      NfeRetAutorizacao4: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
    },
  },
  MG: {
    producao: {
      NfeAutorizacao4: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
      NfeRetAutorizacao4: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4",
    },
    homologacao: {
      NfeAutorizacao4: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
      NfeRetAutorizacao4: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4",
    },
  },
  SVRS: {
    producao: {
      NfeAutorizacao4: "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
      NfeRetAutorizacao4: "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    },
    homologacao: {
      NfeAutorizacao4: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
      NfeRetAutorizacao4: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    },
  },
  SVAN: {
    producao: {
      NfeAutorizacao4: "https://www.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx",
      NfeRetAutorizacao4: "https://www.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
    },
    homologacao: {
      NfeAutorizacao4: "https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx",
      NfeRetAutorizacao4: "https://hom.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
    },
  },
} as const;

/** RJ usa SVRS nos serviços usuais; MA utiliza SVAN; SP e MG possuem autorizadores próprios. */
export const UF_NFE_AUTHORITY = {
  SP: "SP",
  MG: "MG",
  RJ: "SVRS",
  MA: "SVAN",
} as const satisfies Readonly<Record<string, NfeAuthority>>;

export function getNfeServiceUrl(
  authority: NfeAuthority,
  environment: NfeEnvironment,
  service: NfeService,
): string {
  return SEFAZ_ENDPOINTS[authority][environment][service];
}

export function getNfeAuthorityForUf(uf: string): NfeAuthority {
  const normalizedUf = uf.trim().toUpperCase();
  if (normalizedUf === "SP" || normalizedUf === "MG") return normalizedUf;
  if (normalizedUf === "RJ") return "SVRS";
  if (normalizedUf === "MA") return "SVAN";
  throw new RangeError(`Não há autorizador NF-e configurado para a UF "${normalizedUf}".`);
}
