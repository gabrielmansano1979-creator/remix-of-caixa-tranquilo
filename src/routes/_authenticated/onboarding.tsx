import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileUp, PencilLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { profileQuery, todaySP } from "@/lib/app-data";
import { Logo } from "@/components/brand";
import { MoneyInput } from "@/components/money-input";
import { FieldError } from "@/components/auth-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Primeiros passos — Critical Cash" }, { name: "robots", content: "noindex" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery),
  pendingComponent: () => <div className="mx-auto max-w-lg p-6"><Skeleton className="h-96 rounded-2xl" /></div>,
  errorComponent: () => <p className="p-6 text-center text-danger">Não foi possível carregar. Recarregue a página.</p>,
  component: Onboarding,
});

const schema = z.object({
  business_name: z.string().trim().min(2, "Informe o nome do negócio.").max(120),
  reply_to_email: z.string().trim().email("Informe um e-mail válido.").max(255),
  initial_balance_cents: z.number().int(),
});

function Onboarding() {
  const { user } = Route.useRouteContext();
  const { data: profile } = useSuspenseQuery(profileQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const { register, handleSubmit, control, formState } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      business_name: profile?.business_name ?? "",
      reply_to_email: profile?.reply_to_email ?? user.email ?? "",
      initial_balance_cents: profile?.initial_balance_cents ?? 0,
    },
  });

  const saveStep1 = handleSubmit(async (v) => {
    const { error } = await supabase.from("profiles").update({ ...v, balance_date: todaySP() }).eq("user_id", user.id);
    if (error) return toast.error("Não foi possível salvar. Tente novamente.");
    setStep(2);
  });

  const finish = async (mode: "manual" | "csv") => {
    const { error } = await supabase.from("profiles").update({ onboarding_done: true }).eq("user_id", user.id);
    if (error) return toast.error("Não foi possível concluir. Tente novamente.");
    await qc.invalidateQueries({ queryKey: ["profile"] });
    toast.success("Tudo pronto!");
    navigate({ to: "/contas", search: { novo: mode === "manual" ? 1 : undefined, importar: mode === "csv" ? 1 : undefined } });
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-lg">
        <Logo to="/caixa" />
        <div className="mt-8">
          <p className="text-sm text-muted-foreground">Passo {step} de 2</p>
          <Progress value={step * 50} className="mt-2 h-2" aria-label="Progresso do cadastro" />
        </div>
        <div className="mt-6 rounded-2xl border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8">
          {step === 1 ? (
            <form onSubmit={saveStep1} noValidate className="space-y-5">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Sobre o seu negócio</h1>
                <p className="mt-1 text-sm text-muted-foreground">Leva menos de 1 minuto.</p>
              </div>
              <div>
                <Label htmlFor="business_name">Nome do negócio</Label>
                <Input id="business_name" className="mt-1.5 h-11 rounded-xl" placeholder="Ex.: Studio Ana Design" {...register("business_name")} />
                <FieldError msg={formState.errors.business_name?.message} />
              </div>
              <div>
                <Label htmlFor="reply_to_email">E-mail para respostas dos clientes</Label>
                <Input id="reply_to_email" type="email" className="mt-1.5 h-11 rounded-xl" {...register("reply_to_email")} />
                <p className="mt-1 text-xs text-muted-foreground">Quando um cliente responder a cobrança, a resposta chega aqui.</p>
                <FieldError msg={formState.errors.reply_to_email?.message} />
              </div>
              <div>
                <Label htmlFor="balance">Saldo atual em caixa</Label>
                <Controller control={control} name="initial_balance_cents" render={({ field }) => (
                  <MoneyInput id="balance" value={field.value} onChange={field.onChange} allowNegative />
                )} />
                <p className="mt-1 text-xs text-muted-foreground">Some o que há hoje nas suas contas. Digite “-” se estiver negativo.</p>
              </div>
              <Button type="submit" className="h-11 w-full rounded-xl" disabled={formState.isSubmitting}>Continuar</Button>
            </form>
          ) : (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Como quer adicionar suas contas?</h1>
                <p className="mt-1 text-sm text-muted-foreground">Contas a receber e a pagar dos próximos 30 dias.</p>
              </div>
              <div className="grid gap-3">
                <button onClick={() => finish("manual")} className="flex min-h-11 items-start gap-4 rounded-xl border p-4 text-left hover:border-primary hover:bg-accent/40">
                  <PencilLine className="mt-0.5 h-5 w-5 text-primary" />
                  <span><span className="block font-medium">Cadastrar manualmente</span><span className="text-sm text-muted-foreground">Rápido: descrição, valor e vencimento.</span></span>
                </button>
                <button onClick={() => finish("csv")} className="flex min-h-11 items-start gap-4 rounded-xl border p-4 text-left hover:border-primary hover:bg-accent/40">
                  <FileUp className="mt-0.5 h-5 w-5 text-primary" />
                  <span><span className="block font-medium">Importar planilha CSV</span><span className="text-sm text-muted-foreground">Traga tudo de uma vez, com prévia antes de salvar.</span></span>
                </button>
              </div>
              <div className="flex items-start gap-3 rounded-xl bg-success/10 p-4 text-sm">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <p><strong>Régua de cobrança ativada.</strong> Seus clientes recebem lembretes 2 dias antes, no dia, e 3 e 7 dias após o vencimento.</p>
              </div>
              <Button variant="ghost" className="h-11 w-full rounded-xl" onClick={() => setStep(1)}>Voltar</Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
