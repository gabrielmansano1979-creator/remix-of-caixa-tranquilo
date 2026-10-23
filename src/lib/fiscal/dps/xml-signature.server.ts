import { spawn } from "node:child_process";
import { createPrivateKey, createPublicKey, X509Certificate } from "node:crypto";
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

/**
 * Extracts the PFX material with the system OpenSSL executable instead of
 * bundling a JavaScript PKCS#12 parser. Password travels in the child process
 * environment, not command-line arguments; decrypted PEM stays in memory.
 */
async function extractSigningMaterial(pfx: Buffer, password: string): Promise<PfxMaterial> {
  const executable = process.env.OPENSSL_BIN || "openssl";
  const child = spawn(
    executable,
    ["pkcs12", "-nodes", "-passin", "env:CRITICAL_CASH_PFX_PASSWORD", "-clcerts"],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CRITICAL_CASH_PFX_PASSWORD: password },
      windowsHide: true,
    },
  );

  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let stdoutBytes = 0;
  const maxOutputBytes = 4 * 1024 * 1024;

  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBytes += chunk.length;
    if (stdoutBytes > maxOutputBytes) {
      child.kill();
      return;
    }
    stdout.push(Buffer.from(chunk));
  });
  child.stderr.on("data", (chunk: Buffer) => {
    if (Buffer.concat(stderr).length < 16 * 1024) stderr.push(Buffer.from(chunk));
  });

  const exit = new Promise<{ code: number | null; error?: Error }>((resolve) => {
    child.once("error", (error) => resolve({ code: null, error }));
    child.once("close", (code) => resolve({ code }));
  });
  child.stdin.end(pfx);

  const result = await exit;
  const output = Buffer.concat(stdout).toString("utf8");
  if (result.error || result.code !== 0 || stdoutBytes > maxOutputBytes) {
    // Avoid returning OpenSSL diagnostics because they may contain environment details.
    throw new Error("Não foi possível abrir o certificado PFX. Verifique a senha, o arquivo e a disponibilidade do OpenSSL.");
  }

  const privateKeyPem = output.match(
    /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/,
  )?.[0];
  const certificates = [...output.matchAll(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
  )].map((match) => match[0]);

  if (!privateKeyPem || certificates.length === 0) {
    throw new Error("O PFX precisa conter chave privada e certificado de contribuinte.");
  }

  const privateKey = createPrivateKey(privateKeyPem);
  const privatePublicDer = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  const certificatePem = certificates.find((pem) => {
    try {
      const certificate = new X509Certificate(pem);
      const publicDer = certificate.publicKey.export({ format: "der", type: "spki" });
      return privatePublicDer.equals(publicDer);
    } catch {
      return false;
    }
  });

  if (!certificatePem) {
    throw new Error("O certificado de contribuinte não corresponde à chave privada do PFX.");
  }

  return { privateKeyPem, certificatePem };
}

/**
 * Signs only the national DPS infDPS element by its Id.
 *
 * The algorithms here follow the national DPS signing profile commonly
 * documented as RSA-SHA1 + SHA1 digest + inclusive C14N. Reconfirm the exact
 * algorithms and transforms against the deployed official XSD/technical note.
 */
export async function signDpsXml(
  dpsXml: string,
  pfx: Buffer,
  pfxPassword: string,
): Promise<string> {
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

  const { privateKeyPem, certificatePem } = await extractSigningMaterial(pfx, pfxPassword);
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
