import {
  generateNfeKeyAndId,
  type NfeKeyInput,
  type NfeModel,
} from "../utils/nfe-key-generator.server";

const NF_E_NAMESPACE = "http://www.portalfiscal.inf.br/nfe";

const UF_CUF: Record<string, string> = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
  MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27",
  SE: "28", BA: "29", MG: "31", ES: "32", RJ: "33", SP: "35", PR: "41",
  SC: "42", RS: "43", MS: "50", MT: "51", GO: "52", DF: "53",
};

export type NfeAddress = {
  street: string;
  number: string;
  district: string;
  municipalityCode: string;
  municipality: string;
  uf: string;
  postalCode: string;
  countryCode?: string;
  country?: string;
  phone?: string;
};

export type NfeRecipientRegistration =
  | { indIEDest: "1" | "2"; ie: string }
  | { indIEDest: "9"; ie?: never };

export type NfeIssuerInput = {
  cnpj: string;
  legalName: string;
  tradeName?: string;
  address: NfeAddress;
  stateRegistration: string;
  taxRegime: "1" | "2" | "3";
};

export type NfeRecipientInput = {
  cnpj?: string;
  cpf?: string;
  legalName: string;
  address: NfeAddress;
  registration: NfeRecipientRegistration;
  email?: string;
};

export type NfeItemInput = {
  productCode: string;
  barcode?: string;
  description: string;
  ncm: string;
  cfop: string;
  commercialUnit: string;
  commercialQuantity: string;
  commercialUnitPrice: string;
  productValue: string;
  taxableUnit?: string;
  taxableQuantity?: string;
  taxableUnitPrice?: string;
  discount?: string;
  otherExpenses?: string;
  /** ICMS CST 00 (tributada integralmente), com valores calculados pelo emissor. */
  icms: {
    origin: "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
    baseMode: "0" | "1" | "2" | "3";
    base: string;
    rate: string;
    value: string;
  };
  /** PIS CST 01 - operação tributável com alíquota básica. */
  pis: { base: string; rate: string; value: string };
  /** COFINS CST 01 - operação tributável com alíquota básica. */
  cofins: { base: string; rate: string; value: string };
};

export type BuildNfeBaseXmlInput = {
  key: NfeKeyInput;
  ide: {
    natureOfOperation: string;
    invoiceNumber: number;
    series: number;
    issueDateTime: string;
    operationType: "0" | "1";
    destinationType: "1" | "2" | "3";
    municipalityCode: string;
    printFormat: "0" | "1" | "2" | "3" | "4" | "5";
    emissionType: string;
    environment: "1" | "2";
    purpose: "1" | "2" | "3" | "4";
    finalConsumer: "0" | "1";
    presenceIndicator: "0" | "1" | "2" | "3" | "4" | "5" | "9";
    processType?: "0" | "1" | "2" | "3";
    processVersion: string;
  };
  issuer: NfeIssuerInput;
  recipient: NfeRecipientInput;
  items: NfeItemInput[];
  freightMode: "0" | "1" | "2" | "3" | "4" | "9";
};

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function tag(name: string, value: string | number): string {
  return `<${name}>${xmlEscape(String(value))}</${name}>`;
}

function optionalTag(name: string, value?: string): string {
  return value === undefined || value === "" ? "" : tag(name, value);
}

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function requiredDigits(value: string, length: number, field: string): string {
  const result = digits(value);
  if (result.length !== length) {
    throw new Error(`${field} deve conter ${length} dígitos.`);
  }
  return result;
}

function decimal(value: string, field: string, scale = 4): string {
  if (!/^\d+(?:\.\d{1,4})?$/.test(value)) {
    throw new Error(`${field} deve ser um decimal não negativo com ponto e até 4 casas decimais.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} inválido.`);
  return number.toFixed(scale).replace(/\.?0+$/, (match) => match.startsWith(".") ? "" : match);
}

function money(value: string, field: string): string {
  const normalized = decimal(value, field, 2);
  return Number(normalized).toFixed(2);
}

function addressXml(address: NfeAddress, prefix: "enderEmit" | "enderDest"): string {
  const countryCode = address.countryCode ?? "1058";
  const country = address.country ?? "BRASIL";
  const postalCode = requiredDigits(address.postalCode, 8, "CEP");
  const municipalityCode = requiredDigits(address.municipalityCode, 7, "cMun");
  const uf = address.uf.toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) throw new Error("UF do endereço deve conter duas letras.");
  return `<${prefix}>${tag("xLgr", address.street)}${tag("nro", address.number)}${tag("xBairro", address.district)}${tag("cMun", municipalityCode)}${tag("xMun", address.municipality)}${tag("UF", uf)}${tag("CEP", postalCode)}${tag("cPais", countryCode)}${tag("xPais", country)}${optionalTag("fone", address.phone ? digits(address.phone) : undefined)}</${prefix}>`;
}

function validateDocumentIdentity(issuer: NfeIssuerInput, recipient: NfeRecipientInput): void {
  const issuerCnpj = requiredDigits(issuer.cnpj, 14, "CNPJ do emitente");
  if (!issuer.stateRegistration.trim()) throw new Error("IE do emitente é obrigatória.");
  if (!issuer.legalName.trim()) throw new Error("Razão social do emitente é obrigatória.");
  if (Boolean(recipient.cnpj) === Boolean(recipient.cpf)) {
    throw new Error("O destinatário deve informar exatamente um documento: CNPJ ou CPF.");
  }
  if (recipient.cnpj) requiredDigits(recipient.cnpj, 14, "CNPJ do destinatário");
  if (recipient.cpf) requiredDigits(recipient.cpf, 11, "CPF do destinatário");
  if (!recipient.legalName.trim()) throw new Error("Nome/razão social do destinatário é obrigatório.");
  if (!issuerCnpj) throw new Error("CNPJ do emitente inválido.");
  if (recipient.registration.indIEDest !== "9" && !recipient.registration.ie.trim()) {
    throw new Error("IE do destinatário é obrigatória para indIEDest 1 ou 2.");
  }
}

function itemXml(item: NfeItemInput, index: number): string {
  const ncm = requiredDigits(item.ncm, 8, "NCM");
  const cfop = requiredDigits(item.cfop, 4, "CFOP");
  const quantity = decimal(item.commercialQuantity, "qCom");
  const unitPrice = decimal(item.commercialUnitPrice, "vUnCom");
  const productValue = money(item.productValue, "vProd");
  const taxableUnit = item.taxableUnit ?? item.commercialUnit;
  const taxableQuantity = decimal(item.taxableQuantity ?? item.commercialQuantity, "qTrib");
  const taxableUnitPrice = decimal(item.taxableUnitPrice ?? item.commercialUnitPrice, "vUnTrib");
  const discount = money(item.discount ?? "0", "vDesc");
  const otherExpenses = money(item.otherExpenses ?? "0", "vOutro");

  const icmsBase = money(item.icms.base, "vBC ICMS");
  const icmsRate = decimal(item.icms.rate, "pICMS");
  const icmsValue = money(item.icms.value, "vICMS");
  const pisBase = money(item.pis.base, "vBC PIS");
  const pisRate = decimal(item.pis.rate, "pPIS");
  const pisValue = money(item.pis.value, "vPIS");
  const cofinsBase = money(item.cofins.base, "vBC COFINS");
  const cofinsRate = decimal(item.cofins.rate, "pCOFINS");
  const cofinsValue = money(item.cofins.value, "vCOFINS");

  return `<det nItem="${index + 1}"><prod>${tag("cProd", item.productCode)}${tag("cEAN", item.barcode ? digits(item.barcode) : "SEM GTIN")}${tag("xProd", item.description)}${tag("NCM", ncm)}${tag("CFOP", cfop)}${tag("uCom", item.commercialUnit)}${tag("qCom", quantity)}${tag("vUnCom", unitPrice)}${tag("vProd", productValue)}${tag("cEANTrib", item.barcode ? digits(item.barcode) : "SEM GTIN")}${tag("uTrib", taxableUnit)}${tag("qTrib", taxableQuantity)}${tag("vUnTrib", taxableUnitPrice)}${tag("indTot", "1")}${Number(discount) > 0 ? tag("vDesc", discount) : ""}</prod><imposto><ICMS><ICMS00>${tag("orig", item.icms.origin)}${tag("CST", "00")}${tag("modBC", item.icms.baseMode)}${tag("vBC", icmsBase)}${tag("pICMS", icmsRate)}${tag("vICMS", icmsValue)}</ICMS00></ICMS><PIS><PISAliq>${tag("CST", "01")}${tag("vBC", pisBase)}${tag("pPIS", pisRate)}${tag("vPIS", pisValue)}</PISAliq></PIS><COFINS><COFINSAliq>${tag("CST", "01")}${tag("vBC", cofinsBase)}${tag("pCOFINS", cofinsRate)}${tag("vCOFINS", cofinsValue)}</COFINSAliq></COFINS></imposto></det>`;
}

function calculateTotals(items: NfeItemInput[]): string {
  const sum = (selector: (item: NfeItemInput) => string): number =>
    items.reduce((total, item) => total + Number(selector(item)), 0);
  const fmt = (value: number): string => value.toFixed(2);
  const vProd = sum((item) => item.productValue);
  const vDesc = sum((item) => item.discount ?? "0");
  const vOutro = sum((item) => item.otherExpenses ?? "0");
  const vFrete = 0;
  const vSeg = 0;
  const vNF = vProd - vDesc + vOutro + vFrete + vSeg;
  const vBC = sum((item) => item.icms.base);
  const vICMS = sum((item) => item.icms.value);
  const vPIS = sum((item) => item.pis.value);
  const vCOFINS = sum((item) => item.cofins.value);

  return `<total><ICMSTot>${tag("vBC", fmt(vBC))}${tag("vICMS", fmt(vICMS))}${tag("vICMSDeson", "0.00")}${tag("vFCP", "0.00")}${tag("vBCST", "0.00")}${tag("vST", "0.00")}${tag("vFCPST", "0.00")}${tag("vFCPSTRet", "0.00")}${tag("vProd", fmt(vProd))}${tag("vFrete", fmt(vFrete))}${tag("vSeg", fmt(vSeg))}${tag("vDesc", fmt(vDesc))}${tag("vII", "0.00")}${tag("vIPI", "0.00")}${tag("vIPIDevol", "0.00")}${tag("vPIS", fmt(vPIS))}${tag("vCOFINS", fmt(vCOFINS))}${tag("vOutro", fmt(vOutro))}${tag("vNF", fmt(vNF))}${tag("vTotTrib", "0.00")}</ICMSTot></total>`;
}

/**
 * Builds the unsigned NF-e 4.00 XML skeleton for model 55 or 65.
 *
 * This deliberately supports a constrained, explicit tax profile (ICMS CST 00,
 * PIS CST 01 and COFINS CST 01); it does not replace fiscal classification,
 * XMLDSIG signing, XSD validation, or authorization by SEFAZ.
 */
export function buildNfeBaseXml(input: BuildNfeBaseXmlInput): string {
  if (input.items.length === 0) throw new Error("A NF-e deve conter ao menos um item.");
  if (input.items.length > 990) throw new Error("A NF-e não pode conter mais de 990 itens.");
  validateDocumentIdentity(input.issuer, input.recipient);

  if (input.key.model !== "55" && input.key.model !== "65") {
    throw new Error("Modelo de documento fiscal inválido.");
  }
  if (input.ide.invoiceNumber !== input.key.invoiceNumber || input.ide.series !== input.key.series) {
    throw new Error("Série e número do bloco ide devem corresponder aos campos usados na chave.");
  }
  if (input.ide.emissionType !== input.key.emissionType) {
    throw new Error("tpEmis do bloco ide deve corresponder ao campo usado na chave.");
  }

  const key = generateNfeKeyAndId(input.key);
  const cnpj = requiredDigits(input.issuer.cnpj, 14, "CNPJ do emitente");
  const keyCnpj = requiredDigits(input.key.issuerCnpj, 14, "CNPJ usado na chave");
  if (keyCnpj !== cnpj) {
    throw new Error("O CNPJ da chave de acesso deve ser o mesmo CNPJ do emitente.");
  }
  const issuerUf = input.issuer.address.uf.toUpperCase();
  if (!UF_CUF[issuerUf] || UF_CUF[issuerUf] !== input.key.cUF) {
    throw new Error("cUF da chave deve corresponder à UF do endereço do emitente.");
  }
  const ide = input.ide;
  const issueDate = new Date(ide.issueDateTime);
  if (Number.isNaN(issueDate.getTime()) || !/(Z|[+-]\d{2}:\d{2})$/.test(ide.issueDateTime)) {
    throw new Error("dhEmi deve ser uma data ISO 8601 com fuso horário explícito.");
  }
  if (input.key.issueDate !== ide.issueDateTime.slice(0, 10)) {
    throw new Error("A data de emissão do bloco ide deve corresponder à data usada na chave.");
  }

  const ideXml = `<ide>${tag("cUF", input.key.cUF)}${tag("cNF", input.key.numericCode)}${tag("natOp", ide.natureOfOperation)}${tag("mod", input.key.model)}${tag("serie", ide.series)}${tag("nNF", ide.invoiceNumber)}${tag("dhEmi", ide.issueDateTime)}${tag("tpNF", ide.operationType)}${tag("idDest", ide.destinationType)}${tag("cMunFG", requiredDigits(ide.municipalityCode, 7, "cMunFG"))}${tag("tpImp", ide.printFormat)}${tag("tpEmis", ide.emissionType)}${tag("cDV", key.checkDigit)}${tag("tpAmb", ide.environment)}${tag("finNFe", ide.purpose)}${tag("indFinal", ide.finalConsumer)}${tag("indPres", ide.presenceIndicator)}${tag("procEmi", ide.processType ?? "0")}${tag("verProc", ide.processVersion)}</ide>`;

  const issuerXml = `<emit>${tag("CNPJ", cnpj)}${tag("xNome", input.issuer.legalName)}${optionalTag("xFant", input.issuer.tradeName)}${addressXml(input.issuer.address, "enderEmit")}${tag("IE", digits(input.issuer.stateRegistration))}${tag("CRT", input.issuer.taxRegime)}</emit>`;

  const recipientDocument = input.recipient.cnpj
    ? tag("CNPJ", requiredDigits(input.recipient.cnpj, 14, "CNPJ do destinatário"))
    : tag("CPF", requiredDigits(input.recipient.cpf ?? "", 11, "CPF do destinatário"));
  const registrationXml = input.recipient.registration.indIEDest === "9"
    ? tag("indIEDest", "9")
    : `${tag("indIEDest", input.recipient.registration.indIEDest)}${tag("IE", digits(input.recipient.registration.ie))}`;
  const recipientXml = `<dest>${recipientDocument}${tag("xNome", input.recipient.legalName)}${addressXml(input.recipient.address, "enderDest")}${registrationXml}${optionalTag("email", input.recipient.email)}</dest>`;

  const itemsXml = input.items.map(itemXml).join("");
  const transportXml = `<transp>${tag("modFrete", input.freightMode)}</transp>`;

  return `<?xml version="1.0" encoding="UTF-8"?><NFe xmlns="${NF_E_NAMESPACE}"><infNFe Id="${key.infNFeId}" versao="4.00">${ideXml}${issuerXml}${recipientXml}${itemsXml}${calculateTotals(input.items)}${transportXml}</infNFe></NFe>`;
}

export type { NfeKeyInput, NfeModel };
