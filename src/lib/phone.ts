/** Normaliza telefone para E.164. Números sem DDI assumem Brasil (+55). */
export function toE164(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  let d = t.replace(/\D/g, "");
  if (!t.startsWith("+")) { d = d.replace(/^0+/, ""); if (d.length === 10 || d.length === 11) d = "55" + d; }
  return /^[1-9]\d{9,14}$/.test(d) ? "+" + d : null;
}
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = e164.match(/^\+55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
