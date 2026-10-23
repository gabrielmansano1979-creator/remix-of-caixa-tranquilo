import { DOMImplementation, XMLSerializer } from "@xmldom/xmldom";

export const NFE_XML_NAMESPACE = "http://www.portalfiscal.inf.br/nfe";
export const NFE_XML_VERSION = "4.00";

/** Generic XML tree node, allowing repeated children and explicit attributes. */
export interface NfeXmlElementInput {
  name: string;
  value?: string | number | boolean | null;
  attributes?: Record<string, string | number | boolean>;
  children?: NfeXmlElementInput[];
}

export interface BuildNfeBaseXmlInput {
  /** The 44-digit access key or the complete Id attribute ("NFe" + key). */
  id: string;
  ide: NfeXmlElementInput;
  emit: NfeXmlElementInput;
  dest: NfeXmlElementInput;
  /** Each item must be a det node, normally containing prod and imposto. */
  det: NfeXmlElementInput[];
  total: NfeXmlElementInput;
  transp: NfeXmlElementInput;
}

/**
 * Builds the basic NF-e/NFC-e 4.00 XML tree.
 *
 * This is a structural builder, not a substitute for validation against the
 * current official XSD. Business rules, tax calculations, signing, and
 * SOAP-envelope construction belong to their respective services.
 *
 * The official NF-e namespace is http://www.portalfiscal.inf.br/nfe.
 */
export function buildNfeBaseXml(input: BuildNfeBaseXmlInput): string {
  const id = input.id.startsWith("NFe") ? input.id : `NFe${input.id}`;
  if (!/^NFe\d{44}$/.test(id)) {
    throw new Error('O atributo infNFe Id deve ser "NFe" seguido de 44 dígitos.');
  }

  const implementation = new DOMImplementation();
  const document = implementation.createDocument(NFE_XML_NAMESPACE, "NFe", null);
  const root = document.documentElement;
  root.setAttribute("xmlns", NFE_XML_NAMESPACE);

  const infNFe = document.createElementNS(NFE_XML_NAMESPACE, "infNFe");
  infNFe.setAttribute("Id", id);
  infNFe.setAttribute("versao", NFE_XML_VERSION);
  root.appendChild(infNFe);

  const requiredBlocks: Array<[string, NfeXmlElementInput | NfeXmlElementInput[]]> = [
    ["ide", input.ide],
    ["emit", input.emit],
    ["dest", input.dest],
    ["det", input.det],
    ["total", input.total],
    ["transp", input.transp],
  ];

  for (const [expectedName, block] of requiredBlocks) {
    const nodes = Array.isArray(block) ? block : [block];
    if (expectedName === "det" && nodes.length === 0) {
      throw new Error("A NF-e deve conter pelo menos um item det.");
    }

    for (const node of nodes) {
      if (node.name !== expectedName) {
        throw new Error(`Bloco inválido: esperado <${expectedName}>, recebido <${node.name}>.`);
      }
      infNFe.appendChild(appendXmlNode(document, node));
    }
  }

  const xml = new XMLSerializer().serializeToString(document);
  return `<?xml version="1.0" encoding="UTF-8"?>${xml}`;
}

function appendXmlNode(document: Document, input: NfeXmlElementInput): Element {
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(input.name)) {
    throw new Error(`Nome de elemento XML inválido: ${input.name}`);
  }

  const element = document.createElementNS(NFE_XML_NAMESPACE, input.name);

  for (const [name, value] of Object.entries(input.attributes ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(name)) {
      throw new Error(`Nome de atributo XML inválido: ${name}`);
    }
    element.setAttribute(name, String(value));
  }

  if (input.value !== undefined && input.value !== null) {
    element.appendChild(document.createTextNode(String(input.value)));
  }

  for (const child of input.children ?? []) {
    element.appendChild(appendXmlNode(document, child));
  }

  return element;
}
