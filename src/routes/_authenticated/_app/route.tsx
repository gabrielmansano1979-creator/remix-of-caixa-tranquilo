import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CreditCard, ListChecks, LogOut, Settings, Wallet, AlertTriangle, Moon, Sun, UserRound, Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand";
import { accessQuery, profileQuery } from "@/lib/app-data";
import { trialProgress } from "@/lib/plg";
import { TRIAL_DAYS } from "@/config/plans";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  { to: "/contador", label: "Contador Afiliado", icon: UserRound },
] as const;

function AppShell() {
  const { user } = Route.useRouteContext();
  const [currentUser, setCurrentUser] = useState(user);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: access } = useQuery(accessQuery);
  const { data: profile } = useQuery(profileQuery);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) setCurrentUser(session.user);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const metadata = currentUser.user_metadata ?? {};
  const displayName =
    (typeof profile?.full_name === "string" ? profile.full_name.trim() : "") ||
    (typeof metadata.full_name === "string" ? metadata.full_name.trim() : "") ||
    (typeof metadata.name === "string" ? metadata.name.trim() : "") ||
    currentUser.email ||
    "Usuário";
  const avatarUrl =
    (typeof metadata.avatar_url === "string" ? metadata.avatar_url : "") ||
    (typeof metadata.picture === "string" ? metadata.picture : "");
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileNavExpanded, setMobileNavExpanded] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("critical-cash-theme");
    const nextTheme = saved === "light" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    document.documentElement.style.colorScheme = nextTheme;
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem("critical-cash-theme", nextTheme);
  };

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  const linkCls = "group flex h-12 items-center gap-3 overflow-hidden rounded-xl px-3.5 text-sm font-semibold text-muted-foreground transition-all duration-200 hover:bg-background/80 hover:text-foreground";
  const activeCls = "!bg-background !text-primary shadow-[0_4px_14px_-10px_var(--foreground)] ring-1 ring-border/70";

  return (
    <div className="min-h-screen bg-background/70 md:flex">
      {mobileNavOpen && <button type="button" aria-label="Fechar menu" className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileNavOpen(false)} />}
      {mobileNavOpen && (
        <aside className={`fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-sidebar-border/80 bg-sidebar/95 px-3 py-4 shadow-xl backdrop-blur-xl transition-[width] duration-200 ease-out md:hidden ${mobileNavExpanded ? "w-64" : "w-20"}`}>
          <div className="mb-4 flex items-center justify-between">
            <Logo to="/caixa" compact={!mobileNavExpanded} />
            <Button variant="ghost" size="icon" aria-label={mobileNavExpanded ? "Recolher nomes do menu" : "Expandir nomes do menu"} onClick={() => setMobileNavExpanded((expanded) => !expanded)}>
              <Menu className="h-5 w-5" />
            </Button>
          </div>
          <nav className="flex flex-col gap-1.5" aria-label="Principal no celular">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} title={n.label} aria-label={n.label} onClick={() => setMobileNavOpen(false)} className={linkCls} activeProps={{ className: activeCls }}>
                <n.icon className="h-[18px] w-[18px] shrink-0" />
                {mobileNavExpanded && <span className="whitespace-nowrap">{n.label}</span>}
              </Link>
            ))}
          </nav>
          <div className="mt-auto rounded-2xl border border-sidebar-border/70 bg-background/55 p-3">
            <Wallet className="mx-auto h-5 w-5 text-primary" />
            {mobileNavExpanded && <p className="mt-2 text-xs font-semibold">Visão executiva</p>}
          </div>
        </aside>
      )}
      <aside className="group/sidebar fixed left-0 top-0 z-40 hidden h-screen w-20 flex-col border-r border-sidebar-border/80 bg-sidebar/95 px-3 py-4 shadow-xl backdrop-blur-xl transition-[width] duration-200 ease-out hover:w-64 md:flex">
        <div className="overflow-hidden rounded-2xl border border-sidebar-border/70 bg-background/60 px-1 py-3 shadow-sm transition-[padding] group-hover/sidebar:px-3"><Logo to="/caixa" compact /></div>
        <p className="mb-2 mt-8 hidden px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground group-hover/sidebar:block">Gestão financeira</p>
        <nav className="flex flex-col gap-1.5" aria-label="Principal">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} title={n.label} aria-label={n.label} className={linkCls} activeProps={{ className: activeCls }}>
              <n.icon className="h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-105" />
              <span className="hidden whitespace-nowrap group-hover/sidebar:inline-flex">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-sidebar-border/70 bg-background/55 p-3 group-hover/sidebar:p-4">
          <Wallet className="mx-auto h-5 w-5 text-primary group-hover/sidebar:hidden" />
          <p className="hidden whitespace-nowrap text-xs font-semibold group-hover/sidebar:block">Visão executiva</p>
          <p className="mt-1 hidden whitespace-nowrap text-xs leading-relaxed text-muted-foreground group-hover/sidebar:block">Caixa, compromissos e cobranças em um só lugar.</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col md:pl-20">
        <header className="sticky top-0 z-20 flex h-[4.5rem] items-center justify-between border-b border-border/70 bg-background/75 px-4 backdrop-blur-xl md:px-8">
          <div className="md:hidden flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label={mobileNavOpen ? (mobileNavExpanded ? "Recolher menu" : "Expandir nomes do menu") : "Abrir menu"} onClick={() => {
                if (mobileNavOpen) {
                  setMobileNavExpanded((expanded) => !expanded);
                } else {
                  setMobileNavExpanded(true);
                  setMobileNavOpen(true);
                }
              }}>
              <Menu className="h-5 w-5" />
            </Button>
            <Logo to="/caixa" />
          </div>
          <div className="hidden items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_0_4px_color-mix(in_oklch,var(--color-success)_14%,transparent)]" />
            Ambiente seguro
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              className="h-11 w-11 rounded-full p-0"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
              title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
              aria-pressed={theme === "dark"}
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-11 w-11 rounded-full p-0" aria-label="Menu da conta">
                  <Avatar className="h-9 w-9"><AvatarImage src={avatarUrl || undefined} alt={displayName} /><AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback></Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                <DropdownMenuLabel className="truncate font-medium">{displayName}</DropdownMenuLabel><DropdownMenuLabel className="truncate pt-0 font-normal text-muted-foreground">{currentUser.email}</DropdownMenuLabel>
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
            <span>Você está no dia {trialProgress(access.trial_ends_at).day} de {TRIAL_DAYS} do seu teste gratuito. {trialProgress(access.trial_ends_at).remaining} dia(s) restante(s).</span>
            <Button asChild variant="ghost" size="sm" className="min-h-11"><Link to="/planos">Assinar com 20% Off</Link></Button>
          </div>
        )}

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 pb-28 pt-7 md:px-9 md:pb-12 md:pt-9 xl:px-12">
          <Outlet />
          <FeedbackPrompt createdAt={profile?.created_at} />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border/80 bg-background/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_32px_-24px_var(--foreground)] backdrop-blur-xl md:hidden" aria-label="Principal">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className="flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-muted-foreground transition-colors" activeProps={{ className: "!text-primary" }}>
            <n.icon className="h-5 w-5" />{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
