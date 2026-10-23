/**
 * Fiscal registration rules shared by server-side NF-e validation.
 * Do not infer recipient ICMS status solely from MEI/ME/EPP company size.
 */
export type RecipientIcmsStatus = "contribuinte" | "isento" | "nao_contribuinte";
export type CompanyTaxRegime = "MEI" | "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL" | "OUTRO";

export interface RecipientTaxRegistration {
  icmsStatus: RecipientIcmsStatus;
  inscricaoEstadual?: string | null;
  /** Explicitly supplied by validated tax registration data, not guessed from company size. */
  isExemptInState?: boolean;
}

export interface IssuerTaxProfile {
  regime: CompanyTaxRegime;
  /** Whether the issuer is formally registered as MEI/SIMEI for the relevant date. */
  simeiOptant?: boolean;
}

export function resolveIndIEDest(recipient: RecipientTaxRegistration): 1 | 2 | 9 {
  const ie = recipient.inscricaoEstadual?.trim();
  if (recipient.icmsStatus === "contribuinte") {
    if (!ie) throw new Error("Destinatário informado como contribuinte de ICMS sem Inscrição Estadual.");
    if (!/^[0-9A-Za-z./-]{2,20}$/.test(ie)) throw new Error("Inscrição Estadual do destinatário inválida.");
    return 1;
  }
  if (recipient.icmsStatus === "isento") {
    if (recipient.isExemptInState !== true) {
      throw new Error("Não foi confirmada a condição de isento de Inscrição Estadual para a UF.");
    }
    return 2;
  }
  if (recipient.icmsStatus === "nao_contribuinte") return 9;
  throw new Error("Situação de ICMS do destinatário não informada.");
}

/**
 * CRT mapping must follow the NF-e technical note and the issuer's official
 * registration at the issuance date. Never use the size category (ME/EPP) alone.
 */
export function resolveNfeCRT(issuer: IssuerTaxProfile): 1 | 2 | 3 | 4 {
  if (issuer.regime === "MEI") {
    if (issuer.simeiOptant !== true) {
      throw new Error("MEI informado sem confirmação de opção vigente pelo SIMEI.");
    }
    return 4;
  }
  if (issuer.regime === "SIMPLES_NACIONAL") return 1;
  if (issuer.regime === "LUCRO_PRESUMIDO" || issuer.regime === "LUCRO_REAL") return 3;
  throw new Error("Regime tributário do emitente não permite determinar CRT automaticamente.");
}
