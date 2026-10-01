import type { LucideIcon } from "lucide-react";

export function ComingSoon({ title, text, icon: Icon }: { title: string; text: string; icon: LucideIcon }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed bg-card p-10 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-foreground"><Icon className="h-7 w-7" /></span>
        <p className="mt-4 max-w-sm text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
