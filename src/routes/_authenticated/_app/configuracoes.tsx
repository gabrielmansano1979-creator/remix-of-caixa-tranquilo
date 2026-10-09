import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Download, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { parseDbError, profileQuery, todaySP } from "@/lib/app-data";
import { deleteAccount } from "@/lib/account.functions";
import { MoneyInput } from "@/components/money-input";
import { FieldError, PasswordStrength, passwordScore, translateAuthError } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/_app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Critical Cash" }, { name: "description", content: "Ajuste os dados e preferências do seu negócio." }, { property: "og:title", content: "Configurações — Critical Cash" }, { property: "og:description", content: "Ajuste os dados e preferências do seu negócio." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: ConfigPage,
});

const card = "rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)]";
const bizSchema = z.object({
  business_name: z.string().trim().min(2, "Informe o nome do negócio.").max(120),
  initial_balance_cents: z.number().int(),
  cushion_cents: z.number().int().min(0),
});

function ConfigPage() {
  const { data: profile, isLoading, isError, refetch } = useQuery(profileQuery);
  if (isLoading) return <div className="space-y-4"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-40 rounded-2xl" /></div>;
  if (isError || !profile) return <div className={card}><p className="text-danger">Não foi possível carregar.</p><Button variant="outline" className="mt-3 h-11" onClick={() => refetch()}>Tentar novamente</Button></div>;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
      <BusinessForm profile={profile} />
      <Notifications />
      <AccountantSharing />
      <PasswordForm />
      <DataSection />
    </div>
  );
}

function BusinessForm({ profile }: { profile: Tables<"profiles"> }) {
  const qc = useQueryClient();
  const { register, handleSubmit, control, formState } = useForm<z.infer<typeof bizSchema>>({
    resolver: zodResolver(bizSchema),
    defaultValues: { business_name: profile.business_name ?? "", initial_balance_cents: profile.initial_balance_cents, cushion_cents: profile.cushion_cents },
  });
  const onSubmit = handleSubmit(async (v) => {
    const balChanged = v.initial_balance_cents !== profile.initial_balance_cents;
    const { error } = await supabase.from("profiles").update({ ...v, ...(balChanged ? { balance_date: todaySP() } : {}) }).eq("user_id", profile.user_id);
    if (error) return toast.error(parseDbError(error).message);
    qc.invalidateQueries({ queryKey: ["profile"] }); qc.invalidateQueries({ queryKey: ["projection"] });
    toast.success("Dados salvos.");
  });
  return (
    <form onSubmit={onSubmit} noValidate className={`${card} space-y-4`}>
      <h2 className="font-semibold">Perfil e negócio</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="bn">Nome do negócio</Label><Input id="bn" className="mt-1.5 h-11 rounded-xl" {...register("business_name")} /><FieldError msg={formState.errors.business_name?.message} /></div>
        <div><Label htmlFor="ib">Saldo atual</Label><Controller control={control} name="initial_balance_cents" render={({ field }) => <MoneyInput id="ib" value={field.value} onChange={field.onChange} allowNegative />} /></div>
        <div>
          <Label htmlFor="cu">Reserva mínima (colchão)</Label>
          <Controller control={control} name="cushion_cents" render={({ field }) => <MoneyInput id="cu" value={field.value} onChange={field.onChange} />} />
          <p className="mt-1 text-xs text-muted-foreground">Deixe R$ 0,00 para usar 20% das saídas do período.</p>
        </div>
        <div><Label htmlFor="tz">Fuso horário</Label><Input id="tz" value="America/Sao_Paulo (Brasília)" disabled className="mt-1.5 h-11 rounded-xl" /></div>
      </div>
      <Button type="submit" className="h-11 rounded-xl" disabled={formState.isSubmitting}>Salvar</Button>
    </form>
  );
}

function Notifications() {
  return (
    <section className={`${card} space-y-4`}>
      <h2 className="font-semibold">Envio de cobranças</h2>
      <p className="text-sm text-muted-foreground">As mensagens são preparadas para envio manual pelo WhatsApp. Você revisa o conteúdo e confirma o envio no WhatsApp Web ou aplicativo.</p>
    </section>
  );
}

function AccountantSharing() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["accountant-sharing"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_accountant_access");
      if (error) throw error;
      return data as { coupon_code?: string; partner_name?: string; granted_at?: string };
    },
  });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const grant = async () => {
    if (!code.trim()) return toast.error("Informe o cupom do contador.");
    setBusy(true);
    try {
      const { error } = await supabase.rpc("grant_accountant_access", { _coupon_code: code.trim() });
      if (error) throw error;
      setCode("");
      await queryClient.invalidateQueries({ queryKey: ["accountant-sharing"] });
      toast.success("Acesso concedido ao contador informado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível conceder o acesso.");
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("revoke_accountant_access");
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["accountant-sharing"] });
      toast.success("Acesso do contador revogado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível revogar o acesso.");
    } finally {
      setBusy(false);
    }
  };
  const granted = !!data?.coupon_code;
  return (
    <section className={`${card} space-y-4`}>
      <h2 className="font-semibold">Compartilhamento com contador</h2>
      <p className="text-sm text-muted-foreground">Ao informar o cupom e conceder acesso, você autoriza o contador parceiro a consultar seus resumos de caixa e relatórios em modo somente leitura. Você pode revogar essa permissão quando quiser.</p>
      {isLoading ? <p className="text-sm text-muted-foreground">Consultando autorização...</p> : granted ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/20 bg-success/5 p-4">
          <p className="text-sm">Acesso ativo para <strong>{data.partner_name}</strong> (cupom {data.coupon_code}).</p>
          <Button type="button" variant="outline" disabled={busy} onClick={revoke}>Revogar acesso</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input aria-label="Cupom do contador" maxLength={80} value={code} onChange={(event) => setCode(event.target.value)} placeholder="Informe o cupom exclusivo do contador" />
          <Button type="button" disabled={busy} onClick={grant}>Conceder acesso</Button>
        </div>
      )}
    </section>
  );
}

const pwSchema = z.object({ current: z.string().min(1, "Informe a senha atual."), password: z.string().min(8, "Mínimo de 8 caracteres.").max(72), confirm: z.string() })
  .refine((d) => passwordScore(d.password) >= 2, { message: "Use letras maiúsculas, minúsculas e números.", path: ["password"] })
  .refine((d) => d.password === d.confirm, { message: "As senhas não conferem.", path: ["confirm"] });

function PasswordForm() {
  const { register, handleSubmit, formState, watch, reset } = useForm<z.infer<typeof pwSchema>>({ resolver: zodResolver(pwSchema) });
  const onSubmit = handleSubmit(async (v) => {
    const { error } = await supabase.auth.updateUser({ password: v.password, current_password: v.current } as { password: string });
    if (error) return toast.error(translateAuthError(error.message));
    reset(); toast.success("Senha alterada.");
  });
  return (
    <form onSubmit={onSubmit} noValidate className={`${card} space-y-4`}>
      <h2 className="font-semibold">Alterar senha</h2>
      <p className="text-xs text-muted-foreground">Entrou com Google? Use “Esqueci a senha” no login para criar uma.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><Label htmlFor="pc">Senha atual</Label><Input id="pc" type="password" autoComplete="current-password" className="mt-1.5 h-11 rounded-xl" {...register("current")} /><FieldError msg={formState.errors.current?.message} /></div>
        <div><Label htmlFor="pn">Nova senha</Label><Input id="pn" type="password" autoComplete="new-password" className="mt-1.5 h-11 rounded-xl" {...register("password")} /><PasswordStrength value={watch("password") ?? ""} /><FieldError msg={formState.errors.password?.message} /></div>
        <div><Label htmlFor="pf">Confirmar</Label><Input id="pf" type="password" autoComplete="new-password" className="mt-1.5 h-11 rounded-xl" {...register("confirm")} /><FieldError msg={formState.errors.confirm?.message} /></div>
      </div>
      <Button type="submit" variant="outline" className="h-11 rounded-xl" disabled={formState.isSubmitting}>Alterar senha</Button>
    </form>
  );
}

function DataSection() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const del = useServerFn(deleteAccount);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!step) setTyped(""); }, [step]);

  const exportData = async (fmt: "json" | "csv") => {
    const [p, e, r, l] = await Promise.all([
      supabase.from("profiles").select("*").maybeSingle(),
      supabase.from("entries").select("*"),
      supabase.from("reminder_rules").select("*"),
      supabase.from("reminder_logs").select("*"),
    ]);
    if (e.error) return toast.error("Não foi possível exportar.");
    let blob: Blob;
    if (fmt === "json") blob = new Blob([JSON.stringify({ perfil: p.data, contas: e.data, regua: r.data, envios: l.data }, null, 2)], { type: "application/json" });
    else {
      const cols = ["description", "amount_cents", "due_date", "type", "status", "paid_at", "counterparty_name", "counterparty_email"] as const;
      const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      blob = new Blob(["\uFEFF" + [cols.join(","), ...(e.data ?? []).map((row) => cols.map((c) => q(row[c])).join(","))].join("\n")], { type: "text/csv" });
    }
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `caixa-critico-dados.${fmt}` });
    a.click(); URL.revokeObjectURL(a.href);
    toast.success("Exportação pronta.");
  };

  const confirmDelete = async () => {
    setBusy(true);
    try {
      const r = await del({ data: { confirm: "EXCLUIR" } });
      if (!r.ok) { toast.error(r.message); setBusy(false); return; }
      await qc.cancelQueries(); qc.clear();
      await supabase.auth.signOut();
      navigate({ to: "/", replace: true });
    } catch { toast.error("Sem conexão."); setBusy(false); }
  };

  return (
    <section className={`${card} space-y-4`}>
      <h2 className="font-semibold">Meus dados (LGPD)</h2>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="h-11 rounded-xl" onClick={() => exportData("csv")}><Download className="mr-2 h-4 w-4" />Exportar contas (CSV)</Button>
        <Button variant="outline" className="h-11 rounded-xl" onClick={() => exportData("json")}><Download className="mr-2 h-4 w-4" />Exportar tudo (JSON)</Button>
      </div>
      <div className="border-t pt-4">
        <Button variant="ghost" className="h-11 rounded-xl text-danger" onClick={() => setStep(1)}><Trash2 className="mr-2 h-4 w-4" />Excluir minha conta</Button>
      </div>
      <Dialog open={step > 0} onOpenChange={(o) => !o && setStep(0)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>{step === 1 ? "Excluir sua conta?" : "Confirmação final"}</DialogTitle>
            <DialogDescription>
              {step === 1 ? "Sua assinatura será cancelada imediatamente e todas as contas, lembretes e histórico serão apagados. Não é possível desfazer." : "Digite EXCLUIR para confirmar a exclusão permanente."}
            </DialogDescription>
          </DialogHeader>
          {step === 2 && <div><Label htmlFor="cf">Confirmação</Label><Input id="cf" value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1.5 h-11 rounded-xl" autoComplete="off" /></div>}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => setStep(0)}>Manter conta</Button>
            {step === 1 ? <Button variant="destructive" className="h-11 rounded-xl" onClick={() => setStep(2)}>Continuar</Button>
              : <Button variant="destructive" className="h-11 rounded-xl" disabled={typed !== "EXCLUIR" || busy} onClick={confirmDelete}>Excluir definitivamente</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
