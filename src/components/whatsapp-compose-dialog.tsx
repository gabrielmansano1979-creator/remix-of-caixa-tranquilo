import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import type { Entry } from "@/lib/app-data";
import { formatBRL, formatDate } from "@/lib/format";
import { buildWhatsAppMessage, createWhatsAppUrl, type WhatsAppTemplate } from "@/lib/whatsapp-message";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type WhatsAppComposeDialogProps = {
  entries: Entry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEntry?: Entry | null;
};

const TEMPLATES: { id: WhatsAppTemplate; label: string }[] = [
  { id: "pre_due", label: "Lembrete antecipado" },
  { id: "due", label: "Vence hoje" },
  { id: "overdue", label: "Cobrança em atraso" },
  { id: "friendly", label: "Cobrança amigável" },
];

export function WhatsAppComposeDialog({ entries, open, onOpenChange, initialEntry }: WhatsAppComposeDialogProps) {
  const receivables = useMemo(
    () => entries.filter((entry) => entry.type === "income"),
    [entries],
  );
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [template, setTemplate] = useState<WhatsAppTemplate>("due");
  const [message, setMessage] = useState("");
  const selectedEntry = receivables.find((entry) => entry.id === selectedId);
  const filteredEntries = receivables.filter((entry) => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return !term || `${entry.counterparty_name ?? ""} ${entry.description}`.toLocaleLowerCase("pt-BR").includes(term);
  });

  useEffect(() => {
    if (!open) return;
    const initialId = initialEntry && receivables.some((entry) => entry.id === initialEntry.id) ? initialEntry.id : "";
    setSelectedId(initialId);
    setTemplate("due");
    setMessage(initialId && initialEntry ? buildWhatsAppMessage(initialEntry, "due") : "");
    setSearch("");
  }, [open, initialEntry, receivables]);

  const selectEntry = (id: string) => {
    const entry = receivables.find((item) => item.id === id);
    setSelectedId(id);
    setMessage(entry ? buildWhatsAppMessage(entry, template) : "");
  };

  const selectTemplate = (value: WhatsAppTemplate) => {
    setTemplate(value);
    setMessage(selectedEntry ? buildWhatsAppMessage(selectedEntry, value) : "");
  };

  const send = () => {
    if (!selectedEntry) {
      toast.error("Selecione uma conta a receber.");
      return;
    }
    const url = createWhatsAppUrl(selectedEntry, message);
    if (!url) {
      toast.error("Confira o telefone do cliente e o conteúdo da mensagem.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Enviar cobrança pelo WhatsApp</DialogTitle>
          <DialogDescription>Escolha a conta do cliente, revise a mensagem e abra a conversa no WhatsApp.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="whatsapp-client-search" className="text-sm font-medium">Buscar cliente ou conta</label>
            <Input
              id="whatsapp-client-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Digite o nome do cliente ou a descrição"
              className="h-11 rounded-xl"
            />
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border p-1" role="listbox" aria-label="Clientes e contas a receber cadastrados">
              {filteredEntries.length ? filteredEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="option"
                  aria-selected={selectedId === entry.id}
                  onClick={() => selectEntry(entry.id)}
                  className={`w-full rounded-xl px-3.5 py-3 text-left text-sm transition-all duration-200 ${selectedId === entry.id ? "bg-accent text-accent-foreground ring-1 ring-primary/15" : "hover:bg-muted/75"}`}
                >
                  <span className="block font-medium">{entry.counterparty_name || "Cliente sem nome"}</span>
                  <span className="block text-xs text-muted-foreground">{entry.description} · {formatBRL(entry.amount_cents)} · vence {formatDate(entry.due_date)}</span>
                </button>
              )) : (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {receivables.length ? "Nenhum resultado para essa busca." : "Nenhuma conta a receber cadastrada."}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="whatsapp-template" className="text-sm font-medium">Modelo da mensagem</label>
            <select
              id="whatsapp-template"
              value={template}
              onChange={(event) => selectTemplate(event.target.value as WhatsAppTemplate)}
              className="h-11 w-full rounded-xl border border-input/80 bg-background/75 px-3 text-sm shadow-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"
            >
              {TEMPLATES.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </div>

          {selectedEntry && (
            <div className="rounded-2xl border border-primary/10 bg-accent/35 p-4 text-sm">
              <p className="font-medium">{selectedEntry.counterparty_name || "Cliente sem nome"} · {selectedEntry.counterparty_whatsapp || "WhatsApp não cadastrado"}</p>
              <p className="mt-1 text-muted-foreground">{selectedEntry.description} · {formatBRL(selectedEntry.amount_cents)} · vence {formatDate(selectedEntry.due_date)}</p>
              {!selectedEntry.counterparty_whatsapp && <p className="mt-1 text-xs text-warning">Cadastre o WhatsApp deste cliente em Contas para abrir a conversa.</p>}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="whatsapp-message" className="text-sm font-medium">Mensagem editável</label>
            <Textarea
              id="whatsapp-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Selecione uma conta para gerar a mensagem."
              maxLength={4096}
              rows={7}
              disabled={!selectedEntry}
              className="rounded-xl"
            />
            <p className="text-right text-xs text-muted-foreground">{message.length}/4096</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="h-11 rounded-xl bg-success px-5 text-success-foreground shadow-[0_10px_24px_-14px_var(--color-success)] hover:bg-success/90" disabled={!selectedEntry || !selectedEntry.counterparty_whatsapp || !message.trim()} onClick={send}>
            <MessageCircle className="mr-2 h-4 w-4" />Enviar via WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
