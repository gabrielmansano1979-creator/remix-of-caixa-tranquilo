export type DpsEnvironment = "producao_restrita" | "producao";

export type DpsParty = {
  cnpj?: string;
  cpf?: string;
  inscricaoMunicipal?: string;
  nome?: string;
  email?: string;
  telefone?: string;
};

export type DpsInput = {
  ambiente: DpsEnvironment;
  municipioEmissorIbge: string;
  numeroDps: string | number;
  serieDps: string | number;
  dataEmissao: string;
  competencia: string;
  versaoAplicacao: string;
  prestador: DpsParty & {
    cnpj: string;
    regimeSimplesNacional: "nao_optante" | "mei" | "simples_nacional";
    regimeApuracaoSimples?: "1" | "2" | "3";
    regimeEspecialTributacao?: string; // Código do leiaute oficial, nunca uma descrição livre.
  };
  tomador?: DpsParty;
  localPrestacaoIbge: string;
  codigoTributacaoNacional: string;
  descricaoServico: string;
  valorServico: string | number;
  /** Optional numeric tax/retention codes must come from the official municipal parameters. */
  codigoTributacaoMunicipal?: string;
  codigoNbs?: string;
};

const XML_NS = "http://www.sped.fazenda.gov.br/nfse";

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function requiredDigits(value: string, length: number, field: string): string {
  const result = digits(value);
  if (result.length !== length) throw new Error(`${field} deve conter ${length} dígitos.`);
  return result;
}

function xml(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: string | number | undefined | null): string {
  return value === undefined || value === null || value === ""
    ? ""
    : `<${name}>${xml(value)}</${name}>`;
}

function partyXml(party: DpsParty, required = false): string {
  const cnpj = party.cnpj ? requiredDigits(party.cnpj, 14, "CNPJ") : "";
  const cpf = party.cpf ? requiredDigits(party.cpf, 11, "CPF") : "";
  if (cnpj && cpf) throw new Error("Informe CNPJ ou CPF, não ambos.");
  if (required && !cnpj) throw new Error("O prestador deve informar CNPJ válido.");

  return [
    cnpj ? tag("CNPJ", cnpj) : "",
    cpf ? tag("CPF", cpf) : "",
    tag("IM", party.inscricaoMunicipal),
    tag("xNome", party.nome),
    tag("fone", party.telefone ? digits(party.telefone) : undefined),
    tag("email", party.email),
  ].join("");
}

/**
 * Builds the single-DPS XML document used by the synchronous SEFIN Nacional
 * POST /nfse API. This endpoint's documented payload is a DPS, not the legacy
 * EnviarLoteDpsEnvio/ListaDps SOAP envelope. Validate this skeleton against the
 * current official XSD and Anexo I before production use.
 */
export function buildDpsXml(input: DpsInput): { xml: string; infDpsId: string } {
  const municipio = requiredDigits(input.municipioEmissorIbge, 7, "Código IBGE do município emissor");
  requiredDigits(input.localPrestacaoIbge, 7, "Código IBGE do local da prestação");

  const cnpj = requiredDigits(input.prestador.cnpj, 14, "CNPJ do prestador");
  const serie = digits(String(input.serieDps));
  const numero = digits(String(input.numeroDps));
  if (!serie || serie.length > 5) throw new Error("A série da DPS deve ter de 1 a 5 dígitos.");
  if (!numero || numero.length > 15) throw new Error("O número da DPS deve ter de 1 a 15 dígitos.");
  if (!/^\d{4}-\d{2}-\d{2}T/.test(input.dataEmissao)) {
    throw new Error("Data de emissão deve ser ISO 8601 com data e hora.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.competencia)) {
    throw new Error("Competência deve usar o formato AAAA-MM-DD.");
  }
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(String(input.valorServico))) {
    throw new Error("Valor do serviço inválido.");
  }
  const valor = String(input.valorServico).replace(",", ".");
  if (!Number.isFinite(Number(valor)) || Number(valor) <= 0) {
    throw new Error("O valor do serviço deve ser maior que zero.");
  }
  if (!/^\d{6}$/.test(input.codigoTributacaoNacional)) {
    throw new Error("Código de tributação nacional deve ter 6 dígitos conforme o leiaute configurado.");
  }

  // National identifier: ID + municipality (7) + type of federal registration (1)
  // + federal registration (14) + series (5) + DPS number (15).
  const infDpsId = `ID${municipio}2${cnpj}${serie.padStart(5, "0")}${numero.padStart(15, "0")}`;
  const tpAmb = input.ambiente === "producao" ? "1" : "2";
  const opSimpNac = {
    nao_optante: "1",
    mei: "2",
    simples_nacional: "3",
  }[input.prestador.regimeSimplesNacional];

  const prestador = [
    partyXml(input.prestador, true),
    "<regTrib>",
    tag("opSimpNac", opSimpNac),
    tag("regApTribSN", input.prestador.regimeApuracaoSimples),
    tag("regEspTrib", input.prestador.regimeEspecialTributacao),
    "</regTrib>",
  ].join("");

  const tomador = input.tomador
    ? `<toma>${partyXml(input.tomador)}</toma>`
    : "";

  const servico = [
    "<serv>",
    "<locPrest>",
    tag("cLocPrestacao", input.localPrestacaoIbge),
    "</locPrest>",
    "<cServ>",
    tag("cTribNac", input.codigoTributacaoNacional),
    tag("cTribMun", input.codigoTributacaoMunicipal),
    tag("xDescServ", input.descricaoServico),
    tag("cNBS", input.codigoNbs),
    "</cServ>",
    "</serv>",
  ].join("");

  const valores = [
    "<valores>",
    "<vServPrest>",
    tag("vServ", Number(valor).toFixed(2)),
    "</vServPrest>",
    "</valores>",
  ].join("");

  const xmlDps = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<DPS xmlns="${XML_NS}" versao="1.00">`,
    `<infDPS Id="${infDpsId}" versao="1.00">`,
    tag("tpAmb", tpAmb),
    tag("dhEmi", input.dataEmissao),
    tag("verAplic", input.versaoAplicacao),
    tag("serie", serie.padStart(5, "0")),
    tag("nDPS", numero.padStart(15, "0")),
    tag("dCompet", input.competencia),
    tag("tpEmit", "1"),
    tag("cLocEmi", municipio),
    `<prest>${prestador}</prest>`,
    tomador,
    servico,
    valores,
    "</infDPS>",
    "</DPS>",
  ].join("");

  return { xml: xmlDps, infDpsId };
}
