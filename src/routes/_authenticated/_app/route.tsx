import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CreditCard, ListChecks, LogOut, Settings, Wallet, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo, ThemeToggle } from "@/components/brand";
import { accessQuery, profileQuery } from "@/lib/app-data";
import { trialProgress } from "@/lib/plg";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { FeedbackPrompt } from "@/components/feedback-prompt";

export const Route = createFileRoute("/_authenticated/_app")({
  beforeLoad: async ({ context }) => {
    const profile = await context.queryClient.ensureQueryData(profileQuery);
    if (profile && !profile.onboarding_done) throw redirect({ to: "/onboarding" });
  },
  component: AppShell,
});

const NAV = [
  { to: "/caixa", label: "Caixa", icon: Wallet },
  { to: "/contas", label: "Contas", icon: ListChecks },
  { to: "/lembretes", label: "Lembretes", icon: Bell },
] as const;

function AppShell() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: access } = useQuery(accessQuery);
  const { data: profile } = useQuery(profileQuery);
  const initials = (user.email ?? "?").slice(0, 2).toUpperCase();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  const linkCls = "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground";
  const activeCls = "!bg-accent !text-accent-foreground";

  return (
    <div className="min-h-screen bg-background md:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar p-4 md:flex">
        <div className="px-2 py-2"><Logo to="/caixa" /></div>
        <nav className="mt-6 flex flex-col gap-1" aria-label="Principal">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className={linkCls} activeProps={{ className: activeCls }}>
              <n.icon className="h-5 w-5" />{n.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/85 px-4 backdrop-blur md:px-8">
          <div className="md:hidden"><Logo to="/caixa" /></div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-11 w-11 rounded-full p-0" aria-label="Menu da conta">
                  <Avatar className="h-9 w-9"><AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback></Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link to="/configuracoes"><Settings className="mr-2 h-4 w-4" />Configurações</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/assinatura"><CreditCard className="mr-2 h-4 w-4" />Assinatura</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}><LogOut className="mr-2 h-4 w-4" />Sair</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {access && !access.can_write && (
          <div className="flex flex-wrap items-center gap-3 border-b bg-warning/10 px-4 py-3 text-sm md:px-8" role="status">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="flex-1">Seu acesso de edição está pausado. Você está no modo somente leitura e os lembretes estão pausados.</span>
            <Button asChild size="sm" className="h-10 rounded-xl"><Link to="/assinatura">Fazer upgrade</Link></Button>
          </div>
        )}
        {access?.status === "past_due" && (
          <div className="flex flex-wrap items-center gap-3 border-b bg-warning/10 px-4 py-3 text-sm md:px-8" role="status">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="flex-1">Não conseguimos cobrar sua assinatura. Atualize seu pagamento para não perder o acesso.</span>
            <Button asChild size="sm" className="h-10 rounded-xl"><Link to="/assinatura">Atualizar pagamento</Link></Button>
          </div>
        )}
        {access?.status === "pending_pix" && (
          <div className="flex flex-wrap items-center gap-3 border-b bg-warning/10 px-4 py-3 text-sm md:px-8" role="status">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="flex-1">Seu pagamento Pix foi gerado e está aguardando confirmação automática do Asaas para ativar sua assinatura.</span>
            <Button asChild size="sm" className="h-10 rounded-xl"><Link to="/assinatura">Ver status do pagamento</Link></Button>
          </div>
        )}
        {access?.status === "trialing" && access.trial_ends_at && (
          <div className="sticky top-16 z-10 flex flex-wrap items-center justify-center gap-2 border-b bg-accent px-4 py-3 text-center text-sm text-accent-foreground md:px-8">
            <span>Você está no dia {trialProgress(access.trial_ends_at).day} de 7 do seu teste gratuito. {trialProgress(access.trial_ends_at).remaining} dia(s) restante(s).</span>
            <Button asChild variant="ghost" size="sm" className="min-h-11"><Link to="/planos">Assinar com 20% Off</Link></Button>
          </div>
        )}

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-10">
          <Outlet />
          <FeedbackPrompt createdAt={profile?.created_at} />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Principal">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className="flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground" activeProps={{ className: "!text-primary" }}>
            <n.icon className="h-5 w-5" />{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
