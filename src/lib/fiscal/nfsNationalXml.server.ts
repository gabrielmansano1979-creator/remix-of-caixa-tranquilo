import type { DpsInput } from "./dps/xml-generator.server";
import { buildDpsXml } from "./dps/xml-generator.server";
import { signDpsXml } from "./dps/xml-signature.server";
import {
  submitSignedDps,
  type DpsSubmissionResult,
} from "./dps/dps-submission.server";

export type NationalDpsXmlResult = {
  xml: string;
  infDpsId: string;
};

export type SignAndSubmitNationalDpsInput = {
  dps: DpsInput;
  /** PFX bytes decrypted/read on the server; never expose to the browser. */
  certificatePfx: Buffer;
  /** Decrypted PFX password; keep server-side and clear caller buffers where possible. */
  certificatePassword: string;
  /** Authenticated tenant/user ID used by the tenant-scoped mTLS connection. */
  tenantUserId: string;
  /** ID of the tenant-owned fiscal configuration holding the certificate. */
  fiscalConfigId: string;
};

/**
 * Generates the national DPS XML and signs the infDPS node using XMLDSIG.
 *
 * This returns the signed DPS payload for the synchronous SEFIN Nacional
 * endpoint. It intentionally does not add the legacy
 * EnviarLoteDpsEnvio/ListaDps envelope: POST /SefinNacional/nfse expects a
 * signed DPS according to the synchronous API contract.
 *
 * Important: buildDpsXml is a layout skeleton until validated against the
 * current official XSD/Anexo I and applicable municipal rules. The signature
 * profile must also match the currently deployed official technical spec.
 */
export async function generateAndSignNationalDpsXml(input: {
  dps: DpsInput;
  certificatePfx: Buffer;
  certificatePassword: string;
}): Promise<NationalDpsXmlResult> {
  const { xml, infDpsId } = buildDpsXml(input.dps);
  const signedXml = await signDpsXml(
    xml,
    input.certificatePfx,
    input.certificatePassword,
  );

  return { xml: signedXml, infDpsId };
}

/**
 * End-to-end helper: build DPS, sign infDPS, and submit using the existing
 * tenant-scoped mTLS Axios service. Call only after authenticating the user
 * and authorizing access to the tenant fiscal configuration.
 */
export async function generateSignAndSubmitNationalDps(
  input: SignAndSubmitNationalDpsInput,
): Promise<{
  infDpsId: string;
  signedXml: string;
  submission: DpsSubmissionResult;
}> {
  const generated = await generateAndSignNationalDpsXml({
    dps: input.dps,
    certificatePfx: input.certificatePfx,
    certificatePassword: input.certificatePassword,
  });

  const submission = await submitSignedDps({
    tenantUserId: input.tenantUserId,
    fiscalConfigId: input.fiscalConfigId,
    signedDpsXml: generated.xml,
  });

  return {
    infDpsId: generated.infDpsId,
    signedXml: generated.xml,
    submission,
  };
}
