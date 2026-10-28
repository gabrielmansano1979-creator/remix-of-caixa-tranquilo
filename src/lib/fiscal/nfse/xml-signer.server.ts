import forge from "node-forge";
import { SignedXml } from "xml-crypto";

const RSA_SHA256 = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const SHA256 = "http://www.w3.org/2001/04/xmlenc#sha256";
const EXCLUSIVE_C14N = "http://www.w3.org/2001/10/xml-exc-c14n#";

function extractPkcs12(pfxBuffer: Buffer, passphrase: string): { privateKeyPem: string; certificatePem: string } {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const der = forge.util.createBuffer(pfxBuffer.toString("binary"), "raw");
    const asn1 = forge.asn1.fromDer(der, false);
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase);
  } catch {
    throw new Error("Não foi possível abrir o certificado A1. Verifique o arquivo PKCS#12 e a senha.");
  }
  const keyBags = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  const key = keyBags.find((bag) => bag.key)?.key as forge.pki.PrivateKey | undefined;
  const cert = certBags.find((bag) => bag.cert)?.cert as forge.pki.Certificate | undefined;
  if (!key || !cert) throw new Error("O PKCS#12 não contém chave privada e certificado X.509.");
  return { privateKeyPem: forge.pki.privateKeyToPem(key), certificatePem: forge.pki.certificateToPem(cert) };
}
function certificateBase64(pem: string): string {
  return pem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\s+/g, "");
}

/** Signs infDPS by its Id using enveloped XMLDSig, RSA-SHA256 and Exclusive C14N. */
export async function signDpsXml(xml: string, pfxBuffer: Buffer, passphrase: string): Promise<string> {
  // The national DPS identifier is "ID" followed by 42 digits:
  // municipality (7), registration type (1), CNPJ/CPF field (14),
  // series (5), and DPS number (15). Match the generator's exact format.
  if (!xml.includes("<infDPS") || !/\bId="ID\d{42}"/.test(xml)) {
    throw new Error("XML DPS inválido: infDPS com atributo Id oficial não encontrado.");
  }
  const { privateKeyPem, certificatePem } = extractPkcs12(pfxBuffer, passphrase);
  const signer = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certificatePem,
    signatureAlgorithm: RSA_SHA256,
    canonicalizationAlgorithm: EXCLUSIVE_C14N,
    getKeyInfoContent: () => "<X509Data><X509Certificate>" + certificateBase64(certificatePem) + "</X509Certificate></X509Data>",
    idAttribute: "Id",
  });
  signer.addReference({
    xpath: "//*[local-name()='infDPS']",
    transforms: [EXCLUSIVE_C14N],
    digestAlgorithm: SHA256,
  });
  signer.computeSignature(xml, {
    location: { reference: "//*[local-name()='DPS']", action: "append" },
    prefix: "ds",
  });
  const signed = signer.getSignedXml();
  if (!signed.includes("X509Certificate") || !signed.includes("Signature")) {
    throw new Error("A assinatura não incluiu Signature/KeyInfo conforme esperado.");
  }
  return signed;
}
