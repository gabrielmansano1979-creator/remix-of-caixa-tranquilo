/**
 * Official NF-e 4.00 SOAP endpoints for authorization and asynchronous return.
 *
 * Source of truth: Portal Nacional da NF-e and SVRS service directory:
 * https://www.nfe.fazenda.gov.br/portal/WebServices.aspx
 * https://dfe-portal.svrs.rs.gov.br/Nfe/Servicos
 *
 * This map covers the normal authorization environment. Contingency (SVC-AN /
 * SVC-RS), NFC-e-specific state routing, and future endpoint changes must be
 * handled as separate configuration decisions, not inferred automatically.
 */

export type NfeEnvironment = 1 | 2;
export type BrazilianUf =
  | "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO"
  | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI"
  | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO";

export interface NfeServiceEndpoints {
  authorization: string;
  returnAuthorization: string;
}

type EndpointPaths = {
  production: NfeServiceEndpoints;
  homologation: NfeServiceEndpoints;
};

const SVRS_PRODUCTION: NfeServiceEndpoints = {
  authorization: "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  returnAuthorization: "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
};
const SVRS_HOMOLOGATION: NfeServiceEndpoints = {
  authorization: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  returnAuthorization: "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
};
const SVAN_PRODUCTION: NfeServiceEndpoints = {
  authorization: "https://www.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx",
  returnAuthorization: "https://www.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
};
const SVAN_HOMOLOGATION: NfeServiceEndpoints = {
  authorization: "https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx",
  returnAuthorization: "https://hom.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
};

const ENDPOINTS: Record<BrazilianUf, EndpointPaths> = {
  AC: { production: SVRS_PRODUCTION, homologation: SVRS_HOMOLOGATION },
  AL: { production: SVRS_PRODUCTION, homologation: SVRS_HOMOLOGATION },
  AP: { production: SVRS_PRODUCTION, homologation: SVRS_HOMOLOGATION },
  AM: {
    production: {
      authorization: "https://nfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4",
      returnAuthorization: "https://nfe.sefaz.am.gov.br/services2/services/NfeRetAutorizacao4",
    },
    homologation: {
      authorization: "https://homnfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4",
      returnAuthorization: "https://homnfe.sefaz.am.gov.br/services2/services/NfeRetAutorizacao4",
    },
  },
  BA: {
    production: {
      authorization: "https://nfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx",
      returnAuthorization: "https://nfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
    },
    homologation: {
      authorization: "https://hnfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx",
      returnAuthorization: "https://hnfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
    },
  },
  CE: { production: SVRS_PRODUCTION, homologation: SVRS_HOMOLOGATION },
  DF: { production: SVRS_PRODUCTION, homologation: SVRS_HOMOLOGATION },
  ES: { production: SVRS_PRODUCTION, homologation: SVRS_HOMOLOGATION },
  GO: {
    production: {
      authorization: "https://nfe.sefaz.go.gov.br/nfe/services/NFeAutorizacao4",
      returnAuthorization: "https://nfe.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4",
    },
    homologation: {
      authorization: "https://homolog.sefaz.go.gov.br/nfe/services/NFeAutorizacao4",
      returnAuthorization: "https://homolog.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4",
    },
  },
  MA: { production: SVAN_PRODUCTION, homologation: SVAN_HOMOLOGATION },
  MT: {
    production: {
      authorization: "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeAutorizacao4",
      returnAuthorization: "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeRetAutorizacao4",
    },
    homologation: {
      authorization: "https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeAutorizacao4",
      returnAuthorization: "https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeRetAutorizacao4",
    },
  },
  MS: {
    production: {
      authorization: "https://nfe.sefaz.ms.gov.br/ws/NFeAutorizacao4",
      returnAuthorization: "https://nfe.sefaz.ms.gov.br/ws/NFeRetAutorizacao4",
    },
    homologation: {
      authorization: "https://hom.nfe.sefaz.ms.gov.br/ws/NFeAutorizacao4",
      returnAuthorization: "https://hom.nfe.sefaz.ms.gov.br/ws/NFeRetAutorizacao4",
    },
  },
  MG: {
    production: {
      authorization: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
      returnAuthorization: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4",
    },
    homologation: {
      authorization: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
      returnAuthorization: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4",
    },
  },
  PA: { production: SVRS_PRODUCTION, homologation: SVRS_HOMOLOGATION },
  PB: { production: SVRS_PRODUCTION, homologation: SVRS_HOMOLOGATION },
  PR: {
    production: {
      authorization: "https://nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4",
      returnAuthorization: "https://nfe.sefa.pr.gov.br/nfe/NFeRetAutorizacao4",
    },
    homologation: {
      authorization: "https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4",
      returnAuthorization: "https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeRetAutorizacao4",
    },
  },
  PE: {
    production: {
      authorization: "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4",
      returnAuthorization: "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeRetAutorizacao4",
    },
    homologation: {
      authorization: "https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4",
      returnAuthorization: "https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeRetAutorizacao4",
    },
  },
  PI: { production: SVRS_PRODUCTION, homologation: SVRS_HOMOLOGATION },
  RJ: { production: SVRS_PRODUCTION, homologation: SVRS_HOMOLOGATION },
  RN: { production: SVRS_PRODUCTION, homologation: SVRS_HOMOLOGATION },
  RS: {
    production: {
      authorization: "https://nfe.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
      returnAuthorization: "https://nfe.sefazrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    },
    homologation: {
      authorization: "https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
      returnAuthorization: "https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
    },
  },
  RO: { production: SVRS_PRODUCTION, homologation: SVRS_HOMOLOGATION },
  RR: { production: SVRS_PRODUCTION, homologation: SVRS_HOMOLOGATION },
  SC: { production: SVRS_PRODUCTION, homologation: SVRS_HOMOLOGATION },
  SP: {
    production: {
      authorization: "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
      returnAuthorization: "https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
    },
    homologation: {
      authorization: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
      returnAuthorization: "https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
    },
  },
  SE: { production: SVRS_PRODUCTION, homologation: SVRS_HOMOLOGATION },
  TO: { production: SVRS_PRODUCTION, homologation: SVRS_HOMOLOGATION },
};

export function getSefazNfeEndpoints(
  uf: BrazilianUf,
  environment: NfeEnvironment,
): NfeServiceEndpoints {
  const stateEndpoints = ENDPOINTS[uf];
  if (!stateEndpoints) {
    throw new Error(`UF não suportada para NF-e: ${String(uf)}`);
  }
  return environment === 1 ? stateEndpoints.production : stateEndpoints.homologation;
}

/** Exported read-only map for inspection and endpoint health checks. */
export const SEFAZ_NFE_ENDPOINTS: Readonly<Record<BrazilianUf, EndpointPaths>> = ENDPOINTS;
