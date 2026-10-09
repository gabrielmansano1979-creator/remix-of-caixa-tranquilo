import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/brand";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b"><div className="mx-auto flex h-16 max-w-3xl items-center px-4"><Logo /></div></header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          Modelo de conteúdo — revise com seu advogado antes de publicar. Trechos entre [colchetes] devem ser preenchidos.
        </p>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Última atualização: {updated}</p>
        <div className="mt-8 space-y-6 leading-relaxed text-foreground [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted-foreground [&_li]:text-muted-foreground">
          {children}
        </div>
        <Link to="/" className="mt-10 inline-block text-sm text-primary hover:underline">← Voltar ao início</Link>
      </main>
    </div>
  );
}
