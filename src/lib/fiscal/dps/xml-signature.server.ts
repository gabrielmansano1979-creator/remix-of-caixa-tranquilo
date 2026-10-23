import { spawn } from "node:child_process";
import {
  createPrivateKey,
  createPublicKey,
  X509Certificate,
} from "node:crypto";
import { DOMParser } from "@xmldom/xmldom";
import { SignedXml } from "xml-crypto";

const XMLDSIG = "http://www.w3.org/2000/09/xmldsig#";
const C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
const ENVELOPED = `${XMLDSIG}enveloped-signature`;

export type DpsSignatureProfile = "SHA256" | "SHA1";

type SignatureAlgorithms = {
  signatureAlgorithm: string;
  digestAlgorithm: string;
};

/**
 * Complete XMLDSIG algorithm URIs for the supported profiles.
 *
 * SHA1 is the compatibility default documented in the national DPS model
 * reference available to this project. Confirm the active SEFIN/ADN contract
 * before changing the profile used in homologation or production.
 */
const SIGNATURE_PROFILES: Record<DpsSignatureProfile, SignatureAlgorithms> = {
  SHA1: {
    signatureAlgorithm: `${XMLDSIG}rsa-sha1`,
    digestAlgorithm: `${XMLDSIG}sha1`,
  },
  SHA256: {
    signatureAlgorithm:
      "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  },
};

type PfxMaterial = {
  privateKeyPem: string;
  certificatePem: string;
};

/**
 * Extracts the PFX material using the system OpenSSL executable.
 * The password is passed through the child environment rather than argv.
 * Decrypted PEM material remains in memory only.
 */
async function extractSigningMaterial(
  pfx: Buffer,
  password: string,
): Promise<PfxMaterial> {
  const executable = process.env.OPENSSL_BIN || "openssl";
  const child = spawn(
    executable,
    [
      "pkcs12",
      "-nodes",
      "-passin",
      "env:CRITICAL_CASH_PFX_PASSWORD",
      "-clcerts",
    ],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        CRITICAL_CASH_PFX_PASSWORD: password,
      },
      windowsHide: true,
    },
  );

  const stdout: Buffer[] = [];
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

  // Drain stderr without retaining potentially sensitive diagnostics.
  child.stderr.on("data", () => undefined);

  const exit = new Promise<{ code: number | null; error?: Error }>((resolve) => {
    child.once("error", (error) => resolve({ code: null, error }));
    child.once("close", (code) => resolve({ code }));
  });

  child.stdin.end(pfx);

  const result = await exit;
  const output = Buffer.concat(stdout).toString("utf8");

  if (result.error || result.code !== 0 || stdoutBytes > maxOutputBytes) {
    throw new Error(
      "Não foi possível abrir o certificado PFX. Verifique a senha, o arquivo e a disponibilidade do OpenSSL.",
    );
  }

  const privateKeyPem = output.match(
    /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA )?PRIVATE KEY-----/,
  )?.[0];

  const certificates = [
    ...output.matchAll(
      /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
    ),
  ].map((match) => match[0]);

  if (!privateKeyPem || certificates.length === 0) {
    throw new Error(
      "O PFX precisa conter chave privada e certificado de contribuinte.",
    );
  }

  const privateKey = createPrivateKey(privateKeyPem);
  const privatePublicDer = createPublicKey(privateKey).export({
    format: "der",
    type: "spki",
  });

  const certificatePem = certificates.find((pem) => {
    try {
      const certificate = new X509Certificate(pem);
      const publicDer = certificate.publicKey.export({
        format: "der",
        type: "spki",
      });

      return privatePublicDer.equals(publicDer);
    } catch {
      return false;
    }
  });

  if (!certificatePem) {
    throw new Error(
      "O certificado de contribuinte não corresponde à chave privada do PFX.",
    );
  }

  return { privateKeyPem, certificatePem };
}

/**
 * Signs the single infDPS element by its Id and embeds the X.509 certificate
 * in KeyInfo/X509Data/X509Certificate.
 *
 * @param dpsXml DPS XML containing exactly one infDPS element with a valid Id.
 * @param pfx PKCS#12/PFX certificate bundle.
 * @param pfxPassword Password used to open the PFX.
 * @param profile XMLDSIG profile. Defaults to SHA1 for compatibility with the
 * national DPS model reference; select SHA256 only when the target API contract
 * confirms that profile.
 */
export async function signDpsXml(
  dpsXml: string,
  pfx: Buffer,
  pfxPassword: string,
  profile: DpsSignatureProfile = "SHA1",
): Promise<string> {
  if (/<!DOCTYPE|<!ENTITY/i.test(dpsXml)) {
    throw new Error(
      "DPS XML não pode conter DOCTYPE nem declarações de entidades.",
    );
  }

  const algorithms = SIGNATURE_PROFILES[profile];
  if (!algorithms) {
    throw new Error("Perfil de assinatura XMLDSIG não suportado.");
  }

  const parseErrors: string[] = [];
  const doc = new DOMParser({
    errorHandler: (level: string, message: string) => {
      if (level === "error" || level === "fatalError") {
        parseErrors.push(message);
      }
    },
  }).parseFromString(dpsXml, "application/xml");

  if (parseErrors.length > 0 || !doc.documentElement) {
    throw new Error("XML da DPS malformado; a assinatura foi cancelada.");
  }

  const root = doc.documentElement;
  if (
    root.localName !== "DPS" ||
    root.namespaceURI !== "http://www.sped.fazenda.gov.br/nfse"
  ) {
    throw new Error(
      "A raiz deve ser DPS no namespace oficial do Sistema Nacional da NFS-e.",
    );
  }

  const infDpsNodes = doc.getElementsByTagNameNS("*", "infDPS");
  if (infDpsNodes.length !== 1) {
    throw new Error(
      "A DPS deve conter exatamente um elemento infDPS para assinatura.",
    );
  }

  const infDps = infDpsNodes.item(0);
  const infDpsId = infDps?.getAttribute("Id");

  if (!infDps || !infDpsId || !/^ID[A-Za-z0-9]+$/.test(infDpsId)) {
    throw new Error("O elemento infDPS deve possuir um atributo Id válido.");
  }

  // Reject duplicate Id attributes to avoid ambiguous XML signature targets.
  const allElements = doc.getElementsByTagName("*");
  for (let index = 0; index < allElements.length; index += 1) {
    const element = allElements.item(index);

    if (element !== infDps && element?.getAttribute("Id") === infDpsId) {
      throw new Error("O XML contém outro elemento com o mesmo Id da infDPS.");
    }
  }

  const { privateKeyPem, certificatePem } = await extractSigningMaterial(
    pfx,
    pfxPassword,
  );

  const certificateBase64 = new X509Certificate(certificatePem).raw.toString(
    "base64",
  );

  const signer = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certificatePem,
    canonicalizationAlgorithm: C14N,
    signatureAlgorithm: algorithms.signatureAlgorithm,
    getKeyInfoContent: () =>
      `<X509Data><X509Certificate>${certificateBase64}</X509Certificate></X509Data>`,
  });

  signer.addReference({
    xpath: "//*[local-name(.)='infDPS']",
    uri: `#${infDpsId}`,
    transforms: [ENVELOPED, C14N],
    digestAlgorithm: algorithms.digestAlgorithm,
  });

  signer.computeSignature(dpsXml, {
    location: {
      reference: "//*[local-name(.)='infDPS']",
      action: "after",
    },
  });

  const signedXml = signer.getSignedXml();

  if (
    !signedXml.includes("<Signature") &&
    !signedXml.includes(":Signature")
  ) {
    throw new Error("A biblioteca não produziu a tag XMLDSIG esperada.");
  }

  if (!signedXml.includes(`URI="#${infDpsId}"`)) {
    throw new Error("A assinatura gerada não referencia o Id correto da infDPS.");
  }

  if (!signedXml.includes("<X509Certificate>")) {
    throw new Error("A assinatura gerada não contém o certificado X.509.");
  }

  return signedXml;
}
