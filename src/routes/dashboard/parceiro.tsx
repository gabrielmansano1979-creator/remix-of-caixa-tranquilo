import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clipboard, ExternalLink, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPartnerAffiliateLinks, makeAffiliateCouponSeed, validateCrcNumber } from "@/lib/reporting";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "critical_cash_partner_request";
const STATUS_KEY = "critical_cash_partner_status";
const COUPON_KEY = "affiliate_coupon";

export const Route = createFileRoute("/dashboard/parceiro")({
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/login" });
    }
  },
  component: PartnerPage,
});

type PartnerStatus = "none" | "pending_approval" | "approved" | "rejected";

type PartnerRequest = {
  fullName: string;
  taxId: string;
  crcNumber: string;
  pixType: string;
  pixKey: string;
  status: PartnerStatus;
  createdAt: string;
  couponCode: string;
};

const emptyForm = {
  fullName: "",
  taxId: "",
  crcNumber: "",
  pixType: "cpf",
  pixKey: "",
};

function PartnerPage() {
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState<PartnerStatus>("none");
  const [couponCode, setCouponCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedStatus = localStorage.getItem(STATUS_KEY) as PartnerStatus | null;
    const storedCoupon = localStorage.getItem(COUPON_KEY) || "";
    if (saved) {
      const parsed = JSON.parse(saved) as PartnerRequest;
      setForm((current) => ({ ...current, ...parsed, crcNumber: parsed.crcNumber || current.crcNumber }));
      setStatus(parsed.status || savedStatus || "none");
      setCouponCode(parsed.couponCode || storedCoupon || makeAffiliateCouponSeed());
    } else {
      setCouponCode(storedCoupon || makeAffiliateCouponSeed());
      setStatus(savedStatus || "none");
    }
  }, []);

  const links = useMemo(() => getPartnerAffiliateLinks(couponCode), [couponCode]);

  const handleChange = (field: keyof typeof emptyForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!form.fullName.trim() || !form.taxId.trim() || !form.pixKey.trim()) {
      setError("Preencha nome, CPF/CNPJ e chave PIX antes de enviar.");
      return;
    }

    if (!validateCrcNumber(form.crcNumber)) {
      setError("Informe o número do CRC no formato UF-XXXXXX/O, como SP-123456/O.");
      return;
    }

    const nextCoupon = couponCode || makeAffiliateCouponSeed();
    const partnerRequest: PartnerRequest = {
      ...form,
      crcNumber: form.crcNumber.toUpperCase(),
      pixType: form.pixType,
      status: "pending_approval",
      createdAt: new Date().toISOString(),
      couponCode: nextCoupon,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(partnerRequest));
    localStorage.setItem(STATUS_KEY, "pending_approval");
    localStorage.setItem(COUPON_KEY, nextCoupon);
    setCouponCode(nextCoupon);
    setStatus("pending_approval");
    toast.success("Sua solicitação foi enviada com sucesso e está em análise.");
  };

  const copyLink = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado com sucesso.`);
    } catch {
      toast.error("Não foi possível copiar o link neste navegador.");
    }
  };

  const isApproved = status === "approved";
  const isPending = status === "pending_approval";

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">Parceiro contábil</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Programa de parceiros</h1>
        </div>
        <Button asChild variant="outline" className="rounded-xl">
          <a href="/admin/repasses" target="_blank" rel="noreferrer">Acesso administrativo</a>
        </Button>
      </div>

      {isPending && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold text-amber-200">Sua solicitação está em análise</p>
              <p className="text-sm text-amber-100/70">Sua solicitação de parceiro (CRC: {form.crcNumber || "Ainda em validação"}) foi enviada com sucesso e está em análise pela nossa equipe.</p>
            </div>
            <ShieldAlert className="h-6 w-6 text-amber-300" />
          </CardContent>
        </Card>
      )}

      {isApproved && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="flex items-center gap-3 py-5 text-emerald-100">
            <CheckCircle2 className="h-6 w-6" />
            <p className="font-medium">Parceria aprovada. Seus links e cupons já estão liberados.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Quero me tornar um Contador Parceiro</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome completo / Razão social</Label>
                <Input id="fullName" value={form.fullName} onChange={(e) => handleChange("fullName", e.target.value)} placeholder="Ex.: Escritório de Contabilidade Nova Era" />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="taxId">CPF / CNPJ</Label>
                  <Input id="taxId" value={form.taxId} onChange={(e) => handleChange("taxId", e.target.value)} placeholder="000.000.000-00 ou 00.000.000/0000-00" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="crcNumber">Número do CRC</Label>
                  <Input id="crcNumber" value={form.crcNumber} onChange={(e) => handleChange("crcNumber", e.target.value.toUpperCase())} placeholder="SP-123456/O" />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pixType">Tipo de chave PIX</Label>
                  <select id="pixType" value={form.pixType} onChange={(e) => handleChange("pixType", e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2">
                    <option value="cpf">CPF</option>
                    <option value="cnpj">CNPJ</option>
                    <option value="email">E-mail</option>
                    <option value="phone">Telefone</option>
                    <option value="random">Aleatória</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pixKey">Chave PIX</Label>
                  <Input id="pixKey" value={form.pixKey} onChange={(e) => handleChange("pixKey", e.target.value)} placeholder="Chave Pix do favorecido" />
                </div>
              </div>

              {error && <p className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-200">{error}</p>}

              <Button type="submit" className="w-full rounded-xl">
                Enviar solicitação
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-400" />Links do parceiro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
              <p className="text-xs uppercase tracking-[0.18em] text-violet-200">Cupom ativo</p>
              <p className="mt-2 text-lg font-semibold text-white">{couponCode || "Gerando cupom..."}</p>
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border p-3">
                <p className="text-sm text-muted-foreground">Link 1 · Página inicial</p>
                <p className="mt-2 break-all text-sm text-violet-200">{links.home}</p>
                <Button variant="ghost" className="mt-3 rounded-lg" onClick={() => copyLink(links.home, "Link da landing page")}>
                  <Clipboard className="mr-2 h-4 w-4" />Copiar link
                </Button>
              </div>

              <div className="rounded-xl border p-3">
                <p className="text-sm text-muted-foreground">Link 2 · Checkout direto</p>
                <p className="mt-2 break-all text-sm text-violet-200">{links.checkout}</p>
                <Button variant="ghost" className="mt-3 rounded-lg" onClick={() => copyLink(links.checkout, "Link do checkout")}>
                  <Clipboard className="mr-2 h-4 w-4" />Copiar link
                </Button>
              </div>
            </div>

            <div className="flex gap-2">
              <Button asChild variant="outline" className="flex-1 rounded-xl">
                <a href={links.home} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Abrir landing</a>
              </Button>
              <Button asChild variant="outline" className="flex-1 rounded-xl">
                <a href={links.checkout} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Abrir checkout</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
