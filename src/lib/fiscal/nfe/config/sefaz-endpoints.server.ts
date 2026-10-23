/**
 * Endpoints oficiais dos serviços SOAP síncronos de recepção de lote e consulta
 * do recibo NF-e/NFC-e 4.00, conforme os portais oficiais do Portal NF-e e SVRS.
 *
 * Ambiente: 1 = produção; 2 = homologação.
 * Modelo: 55 = NF-e; 65 = NFC-e.
 *
 * As URLs são específicas do serviço; não acrescente "?wsdl" na chamada SOAP.
 * Consulte os portais oficiais antes de alterações de infraestrutura/roteamento.
 */
export type FiscalEnvironment = 1 | 2;
export type NfeDocumentModel = 55 | 65;
export type BrazilianUF =
  | "AC" | "AL" | "AP" | "AM" | "BA" | "CE" | "DF" | "ES" | "GO"
  | "MA" | "MT" | "MS" | "MG" | "PA" | "PB" | "PR" | "PE" | "PI"
  | "RJ" | "RN" | "RS" | "RO" | "RR" | "SC" | "SP" | "SE" | "TO";

export type NfeServiceEndpoints = {
  NfeAutorizacao4: string;
  NfeRetAutorizacao4: string;
};

type EnvironmentPair = Record<FiscalEnvironment, NfeServiceEndpoints>;
type ModelEndpoints = Record<NfeDocumentModel, EnvironmentPair>;
type UfEndpoints = Record<BrazilianUF, ModelEndpoints>;

const pair = (
  authorizationProduction: string,
  receiptProduction: string,
  authorizationHomologation: string,
  receiptHomologation: string,
): EnvironmentPair => ({
  1: {
    NfeAutorizacao4: authorizationProduction,
    NfeRetAutorizacao4: receiptProduction,
  },
  2: {
    NfeAutorizacao4: authorizationHomologation,
    NfeRetAutorizacao4: receiptHomologation,
  },
});

const nfceSVRS = pair(
  "https://nfce.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  "https://nfce.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
  "https://nfce-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  "https://nfce-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
);

const nfeSVRS = pair(
  "https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  "https://nfe.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
  "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
);

const nfceAM = pair(
  "https://nfce.sefaz.am.gov.br/nfce-services/services/NfeAutorizacao4",
  "https://nfce.sefaz.am.gov.br/nfce-services/services/NfeRetAutorizacao4",
  "https://homnfce.sefaz.am.gov.br/nfce-services/services/NfeAutorizacao4",
  "https://homnfce.sefaz.am.gov.br/nfce-services/services/NfeRetAutorizacao4",
);

const nfceGO = pair(
  "https://nfe.sefaz.go.gov.br/nfe/services/NFeAutorizacao4",
  "https://nfe.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4",
  "https://homolog.sefaz.go.gov.br/nfe/services/NFeAutorizacao4",
  "https://homolog.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4",
);

const nfceMS = pair(
  "https://nfce.sefaz.ms.gov.br/ws/NFeAutorizacao4",
  "https://nfce.sefaz.ms.gov.br/ws/NFeRetAutorizacao4",
  "https://hom.nfce.sefaz.ms.gov.br/ws/NFeAutorizacao4",
  "https://hom.nfce.sefaz.ms.gov.br/ws/NFeRetAutorizacao4",
);

const nfceMT = pair(
  "https://nfce.sefaz.mt.gov.br/nfcews/services/NfeAutorizacao4",
  "https://nfce.sefaz.mt.gov.br/nfcews/services/NfeRetAutorizacao4",
  "https://homologacao.sefaz.mt.gov.br/nfcews/services/NfeAutorizacao4",
  "https://homologacao.sefaz.mt.gov.br/nfcews/services/NfeRetAutorizacao4",
);

const nfcePR = pair(
  "https://nfce.sefa.pr.gov.br/nfce/NFeAutorizacao4",
  "https://nfce.sefa.pr.gov.br/nfce/NFeRetAutorizacao4",
  "https://homologacao.nfce.sefa.pr.gov.br/nfce/NFeAutorizacao4",
  "https://homologacao.nfce.sefa.pr.gov.br/nfce/NFeRetAutorizacao4",
);

const nfceRS = pair(
  "https://nfce.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  "https://nfce.sefazrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
  "https://nfce-homologacao.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  "https://nfce-homologacao.sefazrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
);

const nfceSP = pair(
  "https://nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx",
  "https://nfce.fazenda.sp.gov.br/ws/NFeRetAutorizacao4.asmx",
  "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx",
  "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeRetAutorizacao4.asmx",
);

const nfeAM = pair(
  "https://nfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4",
  "https://nfe.sefaz.am.gov.br/services2/services/NfeRetAutorizacao4",
  "https://homnfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4",
  "https://homnfe.sefaz.am.gov.br/services2/services/NfeRetAutorizacao4",
);

const nfeBA = pair(
  "https://nfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx",
  "https://nfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
  "https://hnfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx",
  "https://hnfe.sefaz.ba.gov.br/webservices/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
);

const nfeGO = pair(
  "https://nfe.sefaz.go.gov.br/nfe/services/NFeAutorizacao4",
  "https://nfe.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4",
  "https://homolog.sefaz.go.gov.br/nfe/services/NFeAutorizacao4",
  "https://homolog.sefaz.go.gov.br/nfe/services/NFeRetAutorizacao4",
);

const nfeMG = pair(
  "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
  "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4",
  "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
  "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRetAutorizacao4",
);

const nfeMS = pair(
  "https://nfe.sefaz.ms.gov.br/ws/NFeAutorizacao4",
  "https://nfe.sefaz.ms.gov.br/ws/NFeRetAutorizacao4",
  "https://hom.nfe.sefaz.ms.gov.br/ws/NFeAutorizacao4",
  "https://hom.nfe.sefaz.ms.gov.br/ws/NFeRetAutorizacao4",
);

const nfeMT = pair(
  "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeAutorizacao4",
  "https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeRetAutorizacao4",
  "https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeAutorizacao4",
  "https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeRetAutorizacao4",
);

const nfePE = pair(
  "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4",
  "https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeRetAutorizacao4",
  "https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4",
  "https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeRetAutorizacao4",
);

const nfePR = pair(
  "https://nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4",
  "https://nfe.sefa.pr.gov.br/nfe/NFeRetAutorizacao4",
  "https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4",
  "https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeRetAutorizacao4",
);

const nfeRS = pair(
  "https://nfe.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  "https://nfe.sefazrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
  "https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
  "https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx",
);

const nfeSP = pair(
  "https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
  "https://nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
  "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx",
  "https://homologacao.nfe.fazenda.sp.gov.br/ws/nferetautorizacao4.asmx",
);

const nfeSVAN = pair(
  "https://www.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx",
  "https://www.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
  "https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx",
  "https://hom.sefazvirtual.fazenda.gov.br/NFeRetAutorizacao4/NFeRetAutorizacao4.asmx",
);

const allUfs: BrazilianUF[] = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
];

const nfeByUf: Record<BrazilianUF, EnvironmentPair> = Object.fromEntries(
  allUfs.map((uf) => [
    uf,
    uf === "AM" ? nfeAM :
    uf === "BA" ? nfeBA :
    uf === "GO" ? nfeGO :
    uf === "MG" ? nfeMG :
    uf === "MS" ? nfeMS :
    uf === "MT" ? nfeMT :
    uf === "PE" ? nfePE :
    uf === "PR" ? nfePR :
    uf === "RS" ? nfeRS :
    uf === "SP" ? nfeSP :
    uf === "MA" ? nfeSVAN : nfeSVRS,
  ]),
) as Record<BrazilianUF, EnvironmentPair>;

const nfceByUf: Record<BrazilianUF, EnvironmentPair> = Object.fromEntries(
  allUfs.map((uf) => [
    uf,
    uf === "AM" ? nfceAM :
    uf === "GO" ? nfceGO :
    uf === "MS" ? nfceMS :
    uf === "MT" ? nfceMT :
    uf === "PR" ? nfcePR :
    uf === "RS" ? nfceRS :
    uf === "SP" ? nfceSP : nfceSVRS,
  ]),
) as Record<BrazilianUF, EnvironmentPair>;

export const SEFAZ_ENDPOINTS: UfEndpoints = Object.fromEntries(
  allUfs.map((uf) => [
    uf,
    {
      55: nfeByUf[uf],
      65: nfceByUf[uf],
    },
  ]),
) as UfEndpoints;

export function getNfeServiceEndpoints(input: {
  uf: BrazilianUF;
  environment: FiscalEnvironment;
  model: NfeDocumentModel;
}): NfeServiceEndpoints {
  const endpoints = SEFAZ_ENDPOINTS[input.uf]?.[input.model]?.[input.environment];
  if (!endpoints) {
    throw new Error(
      `Não há endpoints fiscais configurados para UF ${input.uf}, ambiente ${input.environment} e modelo ${input.model}.`,
    );
  }
  return endpoints;
}
