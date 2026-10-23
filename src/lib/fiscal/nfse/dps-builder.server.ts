/**
 * DPS Nacional XML builder.
 * The DPS identifier follows the official composition: "ID" + cLocEmi(7) +
 * tpInsc(1) + CNPJ/CPF padded to 14 + serie(5) + nDPS(15).
 * Validate the generated XML against the current official XSD before sending.
 */
export const DPS_NAMESPACE = "http://www.sped.fazenda.gov.br/nfse";

export interface DpsBuilderInput {
  ambiente: 1 | 2; // 1=produção, 2=produção restrita/homologação, per current layout
  dataHoraEmissao: string; // ISO 8601 with timezone
  versaoAplicacao: string;
  serie: string | number;
  numeroDps: string | number;
  competencia: string; // YYYY-MM-DD
  tipoEmitente: 1 | 2 | 3;
  municipioEmissorIbge: string;
  prestador: {
    cnpj: string;
    inscricaoMunicipal?: string;
    telefone?: string;
    email?: string;
    /** opSimpNac: 1=non-optante, 2=MEI, 3=optante Simples Nacional */
    simplesNacional: 1 | 2 | 3;
    regimeApuracaoTributaria?: 1 | 2 | 3;
  };
  tomador?: {
    cpf?: string;
    cnpj?: string;
    nome: string;
    telefone?: string;
    email?: string;
    endereco?: {
      municipioIbge: string;
      cep: string;
      logradouro: string;
      numero: string;
      complemento?: string;
      bairro: string;
    };
  };
  servico: {
    municipioPrestacaoIbge: string;
    codigoTributacaoNacional: string;
    descricao: string;
    codigoNbs?: string;
    valorServicos: number;
    issRetido?: boolean;
    aliquotaIss?: number;
  };
}

function escapeXml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
function tag(name: string, value: string | number | undefined | null): string {
  return value === undefined || value === null || value === "" ? "" : `<${name}>${escapeXml(value)}</${name}>`;
}
function digits(value: string, field: string): string {
  const result = value.replace(/\D/g, "");
  if (!result) throw new Error(`${field} é obrigatório.`);
  return result;
}
function money(value: number, field: string): string {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} inválido.`);
  return value.toFixed(2);
}
function padded(value: string | number, size: number, field: string): string {
  const s = String(value);
  if (!/^\d+$/.test(s) || s.length > size) throw new Error(`${field} deve ser numérico e ter no máximo ${size} dígitos.`);
  return s.padStart(size, "0");
}
function dateOnly(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value + "T00:00:00Z"))) {
    throw new Error(`${field} deve usar YYYY-MM-DD.`);
  }
  return value;
}

export function buildDpsXml(input: DpsBuilderInput): { xml: string; id: string } {
  const cnpj = digits(input.prestador.cnpj, "CNPJ do prestador");
  if (cnpj.length !== 14) throw new Error("CNPJ do prestador deve conter 14 dígitos.");
  const cLocEmi = digits(input.municipioEmissorIbge, "Município emissor");
  if (cLocEmi.length !== 7) throw new Error("Código IBGE do município emissor deve conter 7 dígitos.");
  const serie = padded(input.serie, 5, "Série da DPS");
  const numero = padded(input.numeroDps, 15, "Número da DPS");
  const id = `ID${cLocEmi}2${cnpj}${serie}${numero}`;
  const valor = money(input.servico.valorServicos, "Valor dos serviços");
  if (!input.servico.descricao.trim()) throw new Error("Descrição do serviço é obrigatória.");
  if (!/^\d{6}$/.test(input.servico.codigoTributacaoNacional)) {
    throw new Error("Código de tributação nacional deve seguir o formato de 6 dígitos do leiaute.");
  }
  if (input.tomador && Boolean(input.tomador.cpf) === Boolean(input.tomador.cnpj)) {
    throw new Error("Informe exatamente um CPF ou CNPJ do tomador.");
  }
  const tomadorId = input.tomador
    ? (input.tomador.cnpj ? tag("CNPJ", digits(input.tomador.cnpj, "CNPJ do tomador")) : tag("CPF", digits(input.tomador.cpf!, "CPF do tomador")))
    : "";
  if (input.tomador?.cnpj && digits(input.tomador.cnpj, "CNPJ do tomador").length !== 14) throw new Error("CNPJ do tomador inválido.");
  if (input.tomador?.cpf && digits(input.tomador.cpf, "CPF do tomador").length !== 11) throw new Error("CPF do tomador inválido.");
  const endereco = input.tomador?.endereco
    ? `<end><endNac>${tag("cMun", digits(input.tomador.endereco.municipioIbge, "Município do tomador"))}${tag("CEP", digits(input.tomador.endereco.cep, "CEP"))}</endNac>${tag("xLgr", input.tomador.endereco.logradouro)}${tag("nro", input.tomador.endereco.numero)}${tag("xCpl", input.tomador.endereco.complemento)}${tag("xBairro", input.tomador.endereco.bairro)}</end>`
    : "";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="${DPS_NAMESPACE}" versao="1.00">
  <infDPS Id="${id}" versao="1.00">
    ${tag("tpAmb", input.ambiente)}
    ${tag("dhEmi", input.dataHoraEmissao)}
    ${tag("verAplic", input.versaoAplicacao)}
    ${tag("serie", serie)}
    ${tag("nDPS", numero)}
    ${tag("dCompet", dateOnly(input.competencia, "Competência"))}
    ${tag("tpEmit", input.tipoEmitente)}
    ${tag("cLocEmi", cLocEmi)}
    <prest>
      ${tag("CNPJ", cnpj)}
      ${tag("IM", input.prestador.inscricaoMunicipal)}
      ${tag("fone", input.prestador.telefone)}
      ${tag("email", input.prestador.email)}
      <regTrib>
        ${tag("opSimpNac", input.prestador.simplesNacional)}
        ${tag("regApTribSN", input.prestador.regimeApuracaoTributaria)}
      </regTrib>
    </prest>
    ${input.tomador ? `<toma>${tomadorId}${tag("xNome", input.tomador.nome)}${endereco}${tag("fone", input.tomador.telefone)}${tag("email", input.tomador.email)}</toma>` : ""}
    <serv>
      <locPrest>${tag("cLocPrestacao", digits(input.servico.municipioPrestacaoIbge, "Município de prestação"))}</locPrest>
      <cServ>
        ${tag("cTribNac", input.servico.codigoTributacaoNacional)}
        ${tag("cNBS", input.servico.codigoNbs)}
        ${tag("xDescServ", input.servico.descricao)}
      </cServ>
    </serv>
    <valores>
      <vServPrest>${tag("vServ", valor)}</vServPrest>
      <trib>
        <tribMun>
          ${tag("tribISSQN", input.servico.issRetido ? 2 : 1)}
          ${tag("pAliq", input.servico.aliquotaIss !== undefined && Number.isFinite(input.servico.aliquotaIss) ? input.servico.aliquotaIss.toFixed(2) : undefined)}
        </tribMun>
      </trib>
    </valores>
  </infDPS>
</DPS>`;
  return { xml, id };
}
