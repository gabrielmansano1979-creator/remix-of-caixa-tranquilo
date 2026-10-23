/**
 * Catálogo de endpoints SOAP NF-e 4.00.
 * URLs consultadas nos portais oficiais do Portal Nacional/SEFAZ e SVRS.
 * Confirme credenciamento, UF autorizadora e ambiente antes de transmitir.
 */

export type FiscalEnvironment = "producao" | "homologacao";
export type NfeDocumentModel = "55" | "65";
export type NfeServiceName = "NfeAutorizacao4" | "NfeRetAutorizacao4";
export type NfeAuthority = "SP" | "MG" | "RJ" | "SVRS" | "SVAN";

export type NfeServiceEndpoints = Readonly<Record<NfeServiceName, string>>;
type ModelEndpointMap = Readonly<Partial<Record<NfeDocumentModel, NfeServiceEndpoints>>>;
type EnvironmentEndpointMap = Readonly<Record<FiscalEnvironment, ModelEndpointMap>>;

export const SEFAZ_ENDPOINTS: Readonly<Record<NfeAuthority, EnvironmentEndpointMap>> = {
  SP: {
    producao: {
      "55": {
        NfeAutorizacao4: "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
        NfeRetAutorizacao4: "https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
      },
      "65": {
        NfeAutorizacao4: "https://nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx",
        NfeRetAutorizacao4: "https://nfce.fazenda.sp.gov.br/ws/NFeRetAutorizacao4.asmx",
      },
    },
    homologacao: {
      "55": {
        NfeAutorizacao4: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
        NfeRetAutorizacao4: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
      },
      "65": {
        NfeAutorizacao4: "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx",
        NfeRetAutorizacao4: "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeRetAutorizacao4.asmx",
      },
    },
  },
  MG: {
    producao: {
      "55": {
        NfeAutorizacao4: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
        NfeRetAutorizacao4: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4",
      },
    },
    homologacao: {
      "55": {
        NfeAutorizacao4: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
        NfeRetAutorizacao4: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4",
      },
    },
  },
  RJ: {
    producao: {
      "55": {
        NfeAutorizacao4: "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
        NfeRetAutorizacao4: "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
      },
    },
    homologacao: {
      "55": {
        NfeAutorizacao4: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
        NfeRetAutorizacao4: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
      },
    },
  },
  SVRS: {
    producao: {
      "55": {
        NfeAutorizacao4: "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
        NfeRetAutorizacao4: "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
      },
      "65": {
        NfeAutorizacao4: "https://nfce.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
        NfeRetAutorizacao4: "https://nfce.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
      },
    },
    homologacao: {
      "55": {
        NfeAutorizacao4: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
        NfeRetAutorizacao4: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
      },
      "65": {
        NfeAutorizacao4: "https://nfce-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
        NfeRetAutorizacao4: "https://nfce-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
      },
    },
  },
  SVAN: {
    producao: {
      "55": {
        NfeAutorizacao4: "https://www.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx",
        NfeRetAutorizacao4: "https://www.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
      },
    },
    homologacao: {
      "55": {
        NfeAutorizacao4: "https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx",
        NfeRetAutorizacao4: "https://hom.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
      },
    },
  },
} as const;

/** Resolve endpoints e falha explicitamente para combinações não cadastradas. */
export function getNfeServiceEndpoints(input: {
  authority: NfeAuthority;
  environment: FiscalEnvironment;
  model: NfeDocumentModel;
}): NfeServiceEndpoints {
  const endpoints = SEFAZ_ENDPOINTS[input.authority][input.environment][input.model];
  if (!endpoints) {
    throw new Error(
      "Não há endpoints cadastrados para autoridade " + input.authority +
      ", ambiente " + input.environment + " e modelo " + input.model + ".",
    );
  }
  return endpoints;
}
