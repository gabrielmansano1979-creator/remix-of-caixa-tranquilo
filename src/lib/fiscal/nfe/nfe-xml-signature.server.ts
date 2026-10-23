import { spawn } from "node:child_process";
import { createPrivateKey, createPublicKey, X509Certificate } from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";

const XMLDSIG = "http://www.w3.org/2000/09/xmldsig#";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = XMLDSIG + "enveloped-signature";
const NFE_NS = "http://www.portalfiscal.inf.br/nfe";

type PfxMaterial = { privateKeyPem: string; certificatePem: string };

/** Extract PFX material using system OpenSSL; never pass the password in argv. */
async function extractPfxMaterial(pfx: Buffer, password: string): Promise<PfxMaterial> {
  const child = spawn(
    process.env.OPENSSL_BIN || "openssl",
    ["pkcs12", "-nodes", "-passin", "env:CRITICAL_CASH_PFX_PASSWORD", "-clcerts"],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CRITICAL_CASH_PFX_PASSWORD: password },
      windowsHide: true,
    },
  );

  const chunks: Buffer[] = [];
  let outputBytes = 0;
  const maxBytes = 4 * 1024 * 1024;
  child.stdout.on("data", (chunk: Buffer) => {
    outputBytes += chunk.length;
    if (outputBytes > maxBytes) {
      child.kill();
      return;
    }
    chunks.push(Buffer.from(chunk));
  });
  child.stderr.on("data", () => undefined);

  const exit = new Promise<{ code: number | null; error?: Error }>((resolve) => {
    child.once("error", (error) => resolve({ code: null, error }));
    child.once("close", (code) => resolve({ code }));
  });
  child.stdin.end(pfx);

  const result = await exit;
  const output = Buffer.concat(chunks).toString("utf8");
  if (result.error || result.code !== 0 || outputBytes > maxBytes) {
    throw new Error("Não foi possível abrir o certificado PFX. Confira a senha e a disponibilidade do OpenSSL.");
  }

  const privateKeyPem = output.match(
    /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/,
  )?.[0];
  const certificates = [...output.matchAll(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
  )].map((match) => match[0]);

  if (!privateKeyPem || certificates.length === 0) {
    throw new Error("O PFX precisa conter chave privada e certificado X.509.");
  }

  const privateKey = createPrivateKey(privateKeyPem);
  const publicKeyDer = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  const certificatePem = certificates.find((pem) => {
    try {
      const certPublicDer = new X509Certificate(pem).publicKey.export({ format: "der", type: "spki" });
      return publicKeyDer.equals(certPublicDer);
    } catch {
      return false;
    }
  });

  if (!certificatePem) {
    throw new Error("O certificado do PFX não corresponde à chave privada.");
  }
  return { privateKeyPem, certificatePem };
}

function parseXml(xml: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new Error("O XML da NF-e não pode conter DOCTYPE nem declarações de entidades.");
  }
  const errors: string[] = [];
  const document = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: (message: string) => errors.push(message),
      fatalError: (message: string) => errors.push(message),
    },
  }).parseFromString(xml, "application/xml");

  if (errors.length || !document.documentElement) {
    throw new Error("O XML da NF-e está malformado.");
  }
  return document;
}

/**
 * Signs infNFe and inserts Signature as its sibling under NFe.
 * The NF-e XMLDSIG profile commonly specified in the MOC uses RSA-SHA1/SHA1;
 * confirm current technical notes before changing this compatibility profile.
 */
export async function signNfeXml(
  nfeXml: string,
  pfx: Buffer,
  pfxPassword: string,
): Promise<string> {
  const doc = parseXml(nfeXml);
  const root = doc.documentElement;
  if (root.localName !== "NFe" || root.namespaceURI !== NFE_NS) {
    throw new Error("A raiz deve ser NFe no namespace oficial http://www.portalfiscal.inf.br/nfe.");
  }

  const infNfeNodes = doc.getElementsByTagNameNS(NFE_NS, "infNFe");
  if (infNfeNodes.length !== 1) {
    throw new Error("O XML deve conter exatamente um elemento infNFe.");
  }

  const infNfe = infNfeNodes.item(0);
  const id = infNfe?.getAttribute("Id");
  if (!id || !/^NFe\d{44}$/.test(id) || id.length !== 47) {
    throw new Error('O atributo infNFe@Id deve seguir o formato "NFe" + chave de acesso de 44 dígitos.');
  }

  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i += 1) {
    const element = all.item(i);
    if (element !== infNfe && element?.getAttribute("Id") === id) {
      throw new Error("O XML contém outro elemento com o mesmo Id da infNFe.");
    }
  }

  const material = await extractPfxMaterial(pfx, pfxPassword);
  const certificateBase64 = new X509Certificate(material.certificatePem).raw.toString("base64");
  const signer = new SignedXml({
    privateKey: material.privateKeyPem,
    publicCert: material.certificatePem,
    canonicalizationAlgorithm: C14N,
    signatureAlgorithm: XMLDSIG + "rsa-sha1",
    getKeyInfoContent: () =>
      "<X509Data><X509Certificate>" + certificateBase64 + "</X509Certificate></X509Data>",
  });

  signer.addReference({
    xpath: "//*[local-name(.)='infNFe']",
    uri: "#" + id,
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: XMLDSIG + "sha1",
  });
  signer.computeSignature(nfeXml, {
    location: { reference: "//*[local-name(.)='infNFe']", action: "after" },
  });

  const signedXml = signer.getSignedXml();
  if (!signedXml.includes('URI="#' + id + '"') || !signedXml.includes("<X509Certificate>")) {
    throw new Error("Não foi possível confirmar a referência da infNFe e o certificado na assinatura.");
  }
  return signedXml;
}
