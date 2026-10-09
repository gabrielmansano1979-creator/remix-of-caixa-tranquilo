import { useState } from "react";
import { Eye, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function ReminderPreview({ company = "Studio Ana Design", body = "Olá, {{nome_cliente}}! {{descricao}}, no valor de {{valor}}, vence em {{data_vencimento}}. Obrigado! — {{empresa}}", modal = false }: { company?: string; body?: string; modal?: boolean }) {
  const [open, setOpen] = useState(false);
  const values: Record<string, string> = { cliente: "Maria Silva", nome_cliente: "Maria Silva", valor: "R$ 1.500,00", vencimento: "15/10/2026", data_vencimento: "15/10/2026", descricao: "Consultoria de outubro", empresa: company, link_pix: "https://www.asaas.com/" };
  const render = (text: string) => text.replace(/\{\{?\s*(\w+)\s*\}\}?/g, (match, key: string) => values[key] ?? match);
  const content = <div className="min-w-0 space-y-5">
    <div className="min-h-56 rounded-lg bg-accent p-5">
      <p className="font-semibold">{company}</p>
      <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-relaxed">{render(body)}</p>
      <p className="mt-5 flex items-center gap-1.5 text-xs text-muted-foreground"><MessageCircle className="h-3.5 w-3.5" />Prévia da mensagem para WhatsApp</p>
    </div>
  </div>;
  if (!modal) return content;
  return <><Button variant="outline" className="min-h-11" onClick={() => setOpen(true)}><Eye className="mr-2 h-4 w-4" />Visualizar lembrete</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Prévia do lembrete</DialogTitle><DialogDescription>Exemplo com dados personalizados do cliente.</DialogDescription></DialogHeader>{content}</DialogContent></Dialog></>;
}