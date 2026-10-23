/**
 * Endpoints SOAP 1.2 da NF-e 4.00 publicados no Portal Nacional da NF-e.
 *
 * A lista é intencionalmente limitada a URLs conferidas no portal oficial.
 * Para UFs não mapeadas, não invente URL: adicione-a após conferir as fontes
 * oficiais. NFC-e (modelo 65) pode ter particularidades operacionais estaduais.
 */
export type NfeEnvironment = "producao" | "homologacao";
export type NfeServiceName = "NfeAutorizacao4" | "NfeRetAutorizacao4";
export type NfeAuthority = "AM" | "BA" | "PR" | "RS" | "SP" | "SVAN" | "SVRS";

export type NfeServiceEndpoints = Readonly<Record<NfeServiceName, string>>;
export type NfeEnvironmentEndpoints = Readonly<
  Record<NfeEnvironment, NfeServiceEndpoints>
>;

export const SEFAZ_NFE_ENDPOINTS: Readonly<
  Record<NfeAuthority, NfeEnvironmentEndpoints>
> = {
  AM: {
    producao: {
      NfeAutorizacao4: "https://nfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4",
      NfeRetAutorizacao4: "https://nfe.sefaz.am.gov.br/services2/services/NfeRetAutorizacao4",
    },
    homologacao: {
      NfeAutorizacao4: "https://homnfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4",
      NfeRetAutorizacao4: "https://homnfe.sefaz.am.gov.br/services2/services/NfeRetAutorizacao4",
    },
  },
  BA: {
    producao: {
      NfeAutorizacao4: "https://nfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx",
      NfeRetAutorizacao4: "https://nfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
    },
    homologacao: {
      NfeAutorizacao4: "https://hnfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx",
      NfeRetAutorizacao4: "https://hnfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
    },
  },
  PR: {
    producao: {
      NfeAutorizacao4: "https://nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4?wsdl",
      NfeRetAutorizacao4: "https://nfe.sefa.pr.gov.br/nfe/NFeRetAutorizacao4?wsdl",
    },
    homologacao: {
      NfeAutorizacao4: "https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4?wsdl",
      NfeRetAutorizacao4: "https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeRetAutorizacao4?wsdl",
    },
  },
  RS: {
    producao: {
      NfeAutorizacao4: "https://nfe.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
      NfeRetAutorizacao4: "https://nfe.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeRetAutorizacao4.asmx",
    },
    homologacao: {
      NfeAutorizacao4: "https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
      NfeRetAutorizacao4: "https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeRetAutorizacao4.asmx",
    },
  },
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
  SVRS: {
    producao: {
      NfeAutorizacao4: "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
      NfeRetAutorizacao4: "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeRetAutorizacao4.asmx",
    },
    homologacao: {
      NfeAutorizacao4: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
      NfeRetAutorizacao4: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeRetAutorizacao4.asmx",
    },
  },
};

/** UFs que usam autorizador virtual para os serviços NF-e listados no portal. */
export const UF_NFE_AUTHORITY = {
  AC: "SVRS",
  AL: "SVRS",
  AP: "SVRS",
  CE: "SVRS",
  DF: "SVRS",
  ES: "SVRS",
  MA: "SVAN",
  PA: "SVRS",
  PB: "SVRS",
  PI: "SVRS",
  RJ: "SVRS",
  RN: "SVRS",
  RO: "SVRS",
  RR: "SVRS",
  SC: "SVRS",
  SE: "SVRS",
  TO: "SVRS",
} as const;

export type MappedNfeUf = keyof typeof UF_NFE_AUTHORITY;

export function getNfeServiceEndpoint(
  authority: NfeAuthority,
  environment: NfeEnvironment,
  service: NfeServiceName,
): string {
  return SEFAZ_NFE_ENDPOINTS[authority][environment][service];
}

export function getVirtualNfeServiceEndpoint(
  uf: MappedNfeUf,
  environment: NfeEnvironment,
  service: NfeServiceName,
): string {
  return getNfeServiceEndpoint(UF_NFE_AUTHORITY[uf], environment, service);
}
