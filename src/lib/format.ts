const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const formatBRL = (cents: number, noCents = false) => (noCents ? brl0 : brl).format(cents / 100);

export const formatDate = (iso: string | Date) => {
  const d = typeof iso === "string" ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso) : iso;
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
};
