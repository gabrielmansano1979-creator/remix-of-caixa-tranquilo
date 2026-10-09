import { useState } from "react";
import { Mail, MessageCircle, Eye } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function ReminderPreview({ company = "Studio Ana Design", subject = "Lembrete de pagamento", body = "Olá, {{nome_cliente}}! {{descricao}}, no valor de {{valor}}, vence em {{data_vencimento}}. Obrigado! — {{empresa}}", modal = false }: { company?: string; subject?: string; body?: string; modal?: boolean }) {
  const [channel, setChannel] = useState("email");
  const [open, setOpen] = useState(false);
  const values: Record<string, string> = { cliente: "Maria Silva", nome_cliente: "Maria Silva", valor: "R$ 1.500,00", vencimento: "15/10/2026", data_vencimento: "15/10/2026", descricao: "Consultoria de outubro", empresa: company, link_pix: "https://www.asaas.com/" };
  const render = (text: string) => text.replace(/\{\{?\s*(\w+)\s*\}\}?/g, (match, key: string) => values[key] ?? match);
  const content = <div className="min-w-0 space-y-5">
    <Tabs value={channel} onValueChange={setChannel}><TabsList className="grid h-auto w-full grid-cols-2"><TabsTrigger value="email" className="min-h-11 whitespace-normal"><Mail className="mr-2 h-4 w-4 shrink-0" />Visualizar E-mail</TabsTrigger><TabsTrigger value="whatsapp" className="min-h-11 whitespace-normal"><MessageCircle className="mr-2 h-4 w-4 shrink-0" />Visualizar WhatsApp</TabsTrigger></TabsList></Tabs>
    <div className={channel === "email" ? "min-h-56 border-t pt-5" : "min-h-56 rounded-lg bg-accent p-5"}>
      <p className="font-semibold">{company}</p>
      {channel === "email" && <p className="mt-1 border-b pb-4 text-sm text-muted-foreground">{render(subject)}</p>}
      <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-relaxed">{render(body)}</p>
      <p className="mt-5 text-xs text-muted-foreground">{channel === "whatsapp" ? "10:42 · Mensagem de cobrança" : "Se já pagou, desconsidere esta mensagem."}</p>
    </div>
  </div>;
  if (!modal) return content;
  return <><Button variant="outline" className="min-h-11" onClick={() => setOpen(true)}><Eye className="mr-2 h-4 w-4" />Visualizar lembrete</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Prévia do lembrete</DialogTitle><DialogDescription>Exemplo com dados personalizados do cliente.</DialogDescription></DialogHeader>{content}</DialogContent></Dialog></>;
}