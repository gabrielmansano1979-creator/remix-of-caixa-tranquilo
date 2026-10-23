/**
 * Defensive DPS layout gate.
 *
 * This is intentionally NOT represented as an XSD validator: the official
 * current-version XSD bundle and a real XSD engine are not present in this
 * repository. Structural checks catch incomplete mandatory groups, then the
 * function fails closed until official XSD validation is wired in.
 */
const REQUIRED_DPS_GROUPS: Array<{ label: string; pattern: RegExp }> = [
  { label: "raiz DPS e namespace nacional", pattern: /<DPS\b[^>]*xmlns=["']http:\/\/www\.sped\.fazenda\.gov\.br\/nfse["'][^>]*>/ },
  { label: "infDPS com Id e versão", pattern: /<infDPS\b(?=[^>]*\bId=["'][^"']+["'])(?=[^>]*\bversao=["'][^"']+["'])[^>]*>/ },
  { label: "tpAmb", pattern: /<tpAmb>\s*[12]\s*<\/tpAmb>/ },
  { label: "dhEmi", pattern: /<dhEmi>[^<]+<\/dhEmi>/ },
  { label: "verAplic", pattern: /<verAplic>[^<]+<\/verAplic>/ },
  { label: "serie", pattern: /<serie>\d+<\/serie>/ },
  { label: "nDPS", pattern: /<nDPS>\d+<\/nDPS>/ },
  { label: "dCompet", pattern: /<dCompet>\d{4}-\d{2}-\d{2}<\/dCompet>/ },
  { label: "tpEmit", pattern: /<tpEmit>\d<\/tpEmit>/ },
  { label: "cLocEmi", pattern: /<cLocEmi>\d{7}<\/cLocEmi>/ },
  { label: "prestador e CNPJ", pattern: /<prest>[\s\S]*?<CNPJ>\d{14}<\/CNPJ>[\s\S]*?<\/prest>/ },
  { label: "regime tributário do prestador", pattern: /<regTrib>[\s\S]*?<opSimpNac>\d<\/opSimpNac>[\s\S]*?<\/regTrib>/ },
  { label: "local de prestação", pattern: /<locPrest>[\s\S]*?<cLocPrestacao>\d{7}<\/cLocPrestacao>[\s\S]*?<\/locPrest>/ },
  { label: "serviço com código nacional e descrição", pattern: /<cServ>[\s\S]*?<cTribNac>\d{6}<\/cTribNac>[\s\S]*?<xDescServ>[^<]+<\/xDescServ>[\s\S]*?<\/cServ>/ },
  { label: "valor do serviço", pattern: /<vServPrest>[\s\S]*?<vServ>\d+(?:\.\d{2})?<\/vServ>[\s\S]*?<\/vServPrest>/ },
  { label: "tributação municipal do ISS", pattern: /<tribMun>[\s\S]*?<tribISSQN>\d<\/tribISSQN>[\s\S]*?<\/tribMun>/ },
  { label: "fechamento de infDPS e DPS", pattern: /<\/infDPS>\s*<\/DPS>\s*$/ },
];

export function assertDpsRequiredGroups(xml: string): void {
  const missing = REQUIRED_DPS_GROUPS.filter(({ pattern }) => !pattern.test(xml)).map(({ label }) => label);
  if (missing.length) {
    throw new Error(`DPS_INCOMPLETE: grupos obrigatórios ausentes ou inválidos: ${missing.join(", ")}.`);
  }

  // Structural presence is not equivalent to XSD validation. Never transmit
  // until the current official SEFIN XSD is loaded and validated by an XSD engine.
  throw new Error(
    "DPS_XSD_VALIDATION_UNAVAILABLE: XML contém os grupos mínimos, mas a validação contra o XSD oficial vigente não está configurada. Nenhum envio foi realizado.",
  );
}
