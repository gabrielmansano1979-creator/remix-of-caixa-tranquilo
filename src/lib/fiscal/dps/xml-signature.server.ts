import * as forge from "node-forge";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";

const XMLDSIG = "http://www.w3.org/2000/09/xmldsig#";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = `${XMLDSIG}enveloped-signature`;
const RSA_SHA1 = `${XMLDSIG}rsa-sha1`;
const SHA1 = `${XMLDSIG}sha1`;

type PfxMaterial = {
  privateKeyPem: string;
  certificatePem: string;
};

function extractSigningMaterial(pfx: Buffer, password: string): PfxMaterial {
  const binary = pfx.toString("binary");
  const asn1 = forge.asn1.fromDer(binary);
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);

  const keyBags =
    p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ] ?? [];
  const plainKeyBags =
    p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [];
  const certBags =
    p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];

  const privateKey = [...keyBags, ...plainKeyBags].find((bag) => bag.key)?.key;
  if (!privateKey) throw new Error("O arquivo PFX não contém uma chave privada utilizável.");

  const rsaKey = privateKey as forge.pki.rsa.PrivateKey;
  const matchingCert = certBags
    .map((bag) => bag.cert)
    .find((cert) => {
      const publicKey = cert?.publicKey as forge.pki.rsa.PublicKey | undefined;
      return Boolean(publicKey && publicKey.n.equals(rsaKey.n) && publicKey.e.equals(rsaKey.e));
    });

  if (!matchingCert) {
    throw new Error("Não foi encontrado no PFX um certificado correspondente à chave privada.");
  }

  return {
    privateKeyPem: forge.pki.privateKeyToPem(rsaKey),
    certificatePem: forge.pki.certificateToPem(matchingCert),
  };
}

/**
 * Signs only the national DPS infDPS element by its Id.
 *
 * The XMLDSIG algorithms here follow the legacy/currently documented national
 * DPS signing profile (RSA-SHA1 + SHA1 digest + inclusive C14N). Reconfirm these
 * URIs against the deployed official XSD/technical note before production use.
 */
export function signDpsXml(dpsXml: string, pfx: Buffer, pfxPassword: string): string {
  if (/<!DOCTYPE|<!ENTITY/i.test(dpsXml)) {
    throw new Error("DPS XML não pode conter DOCTYPE nem declarações de entidades.");
  }

  const parseErrors: string[] = [];
  const doc = new DOMParser({
    errorHandler: (level: string, message: string) => {
      if (level === "error" || level === "fatalError") parseErrors.push(message);
    },
  }).parseFromString(dpsXml, "application/xml");

  if (parseErrors.length > 0 || !doc.documentElement) {
    throw new Error("XML da DPS malformado; a assinatura foi cancelada.");
  }

  const infDpsNodes = doc.getElementsByTagNameNS("*", "infDPS");
  if (infDpsNodes.length !== 1) {
    throw new Error("A DPS deve conter exatamente uma tag infDPS para assinatura.");
  }
  const infDpsId = infDpsNodes.item(0)?.getAttribute("Id");
  if (!infDpsId || !/^ID[A-Za-z0-9]+$/.test(infDpsId)) {
    throw new Error("A tag infDPS deve possuir um atributo Id válido.");
  }

  const { privateKeyPem, certificatePem } = extractSigningMaterial(pfx, pfxPassword);
  const signer = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certificatePem,
    canonicalizationAlgorithm: C14N,
    signatureAlgorithm: RSA_SHA1,
  });

  signer.addReference({
    xpath: "//*[local-name(.)='infDPS']",
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: SHA1,
  });

  signer.computeSignature(dpsXml, {
    location: {
      reference: "//*[local-name(.)='infDPS']",
      action: "after",
    },
  });

  const signedXml = signer.getSignedXml();
  if (!signedXml.includes("<Signature") && !signedXml.includes(":Signature")) {
    throw new Error("A biblioteca não produziu a tag XMLDSIG esperada.");
  }
  return signedXml;
}
