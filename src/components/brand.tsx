import { Link } from "@tanstack/react-router";
import { Moon, Sun, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function Logo({ to = "/" }: { to?: "/" | "/caixa" }) {
  return (
    <Link to={to} className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary text-primary-foreground shadow-[0_8px_18px_-12px_var(--color-primary)]">
        <Wallet className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="text-[15px] font-bold tracking-tight">Critical Cash</span>
    </Link>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };
  return (
    <Button variant="ghost" size="icon" className="h-11 w-11" onClick={toggle} aria-label={dark ? "Usar tema claro" : "Usar tema escuro"}>
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
