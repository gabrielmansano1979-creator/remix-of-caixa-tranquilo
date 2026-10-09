import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/format";

/** Campo monetário com máscara BRL. Valor em centavos. */
export function MoneyInput({ id, value, onChange, allowNegative = false, ...rest }: {
  id: string; value: number; onChange: (cents: number) => void; allowNegative?: boolean; "aria-invalid"?: boolean;
}) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      className="mt-1.5 h-11 rounded-xl num"
      value={formatBRL(value)}
      onChange={(e) => {
        const neg = allowNegative && e.target.value.includes("-");
        const digits = e.target.value.replace(/\D/g, "").slice(0, 13);
        const n = Number(digits || "0");
        onChange(neg ? -n : n);
      }}
      {...rest}
    />
  );
}
