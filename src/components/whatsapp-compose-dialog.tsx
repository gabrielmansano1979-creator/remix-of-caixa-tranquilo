import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import type { Entry } from "@/lib/app-data";
import { formatBRL, formatDate } from "@/lib/format";
import {
  buildCustomWhatsAppMessage,
  buildWhatsAppMessage,
  createWhatsAppUrl,
  type WhatsAppTemplate,
} from "@/lib/whatsapp-message";
import { supabase } from "@/integrations/supabase/client";
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

type ReminderTemplateRow = {
  id: string;
  label: string;
  offset_days: number;
  body_tpl: string;
  active: boolean;
};

const TEMPLATES: { id: WhatsAppTemplate; label: string }[] = [
  { id: "pre_due", label: "Lembrete antecipado" },
  { id: "due", label: "Vence hoje" },
  { id: "overdue", label: "Cobrança em atraso" },
  { id: "friendly", label: "Cobrança amigável" },
];

export function WhatsAppComposeDialog({ entries, open, onOpenChange, initialEntry }: WhatsAppComposeDialogProps) {
  const receivables = useMemo(
    () => entries.filter((entry) => entry.type === "income" && entry.status === "pending"),
    [entries],
  );
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [template, setTemplate] = useState<WhatsAppTemplate>("due");
  const [recipientName, setRecipientName] = useState("");
  const [message, setMessage] = useState("");
  const messageEdited = useRef(false);

  const rulesQuery = useQuery({
    queryKey: ["rules"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("reminder_rules").select("id,label,offset_days,body_tpl,active").order("offset_days", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReminderTemplateRow[];
    },
  });
  const profileQuery = useQuery({
    queryKey: ["profile-lite"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("business_name").maybeSingle();
      if (error) throw error;
      return data?.business_name ?? "Seu negócio";
    },
  });

  const templateOptions = useMemo(() => {
    const savedRules = (rulesQuery.data ?? []).slice(0, 4);
    return TEMPLATES.map((fallback, index) => ({
      ...fallback,
      label: savedRules[index]?.label || fallback.label,
      bodyTemplate: savedRules[index]?.body_tpl || null,
    }));
  }, [rulesQuery.data]);
  const selectedTemplate = templateOptions.find((option) => option.id === template) ?? templateOptions[1] ?? templateOptions[0];
  const selectedBase = receivables.find((entry) => entry.id === selectedId);
  const selectedEntry = useMemo(
    () => selectedBase ? { ...selectedBase, counterparty_name: recipientName.trim() || selectedBase.counterparty_name } : undefined,
    [selectedBase, recipientName],
  );
  const companyName = profileQuery.data || "Seu negócio";
  const filteredEntries = receivables.filter((entry) => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return !term || `${entry.counterparty_name ?? ""} ${entry.description}`.toLocaleLowerCase("pt-BR").includes(term);
  });

  const renderMessage = (entry: Entry, modelId: WhatsAppTemplate) => {
    const model = templateOptions.find((option) => option.id === modelId);
    return model?.bodyTemplate
      ? buildCustomWhatsAppMessage(entry, model.bodyTemplate, companyName)
      : buildWhatsAppMessage(entry, modelId);
  };

  useEffect(() => {
    if (!open) return;
    const initialId = initialEntry && receivables.some((entry) => entry.id === initialEntry.id) ? initialEntry.id : "";
    setSelectedId(initialId);
    setTemplate("due");
    setRecipientName(initialId && initialEntry ? initialEntry.counterparty_name ?? "" : "");
    setMessage(initialId && initialEntry ? buildWhatsAppMessage(initialEntry, "due") : "");
    setSearch("");
    messageEdited.current = false;
    // The second effect refreshes the untouched initial message once saved reminder rules load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialEntry, receivables]);

  useEffect(() => {
    if (!open || !selectedEntry || messageEdited.current) return;
    setMessage(renderMessage(selectedEntry, template));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedEntry, template, templateOptions, companyName]);

  const selectEntry = (id: string) => {
    const entry = receivables.find((item) => item.id === id);
    setSelectedId(id);
    setRecipientName(entry?.counterparty_name ?? "");
    setMessage(entry ? renderMessage(entry, template) : "");
    messageEdited.current = false;
  };

  const selectTemplate = (value: WhatsAppTemplate) => {
    setTemplate(value);
    messageEdited.current = false;
    setMessage(selectedEntry ? renderMessage(selectedEntry, value) : "");
  };

  const send = () => {
    if (!selectedEntry) {
      toast.error("Selecione uma conta pendente a receber.");
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
          <DialogDescription>Escolha uma conta pendente, personalize a mensagem e confira exatamente o texto que será aberto no WhatsApp.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="whatsapp-client-search" className="text-sm font-medium">Buscar cliente ou conta</label>
            <Input
              id="whatsapp-client-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Digite livremente o nome do cliente ou a descrição"
              className="h-11 rounded-xl"
            />
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border p-1" role="listbox" aria-label="Clientes e contas pendentes a receber cadastrados">
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
                  {receivables.length ? "Nenhuma conta pendente encontrada para essa busca." : "Nenhuma conta a receber pendente cadastrada."}
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
              {templateOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            {rulesQuery.isError && <p className="text-xs text-muted-foreground">Não foi possível carregar os modelos salvos; modelos padrão disponíveis.</p>}
          </div>

          {selectedEntry && (
            <div className="space-y-3 rounded-2xl border border-primary/10 bg-accent/35 p-4 text-sm">
              <div>
                <p className="font-medium">{selectedEntry.counterparty_name || "Cliente sem nome"} · {selectedEntry.counterparty_whatsapp || "WhatsApp não cadastrado"}</p>
                <p className="mt-1 text-muted-foreground">{selectedEntry.description} · {formatBRL(selectedEntry.amount_cents)} · vence {formatDate(selectedEntry.due_date)}</p>
                {!selectedEntry.counterparty_whatsapp && <p className="mt-1 text-xs text-warning">Cadastre o WhatsApp deste cliente em Contas para abrir a conversa.</p>}
              </div>
              <div>
                <label htmlFor="whatsapp-recipient-name" className="text-sm font-medium">Nome do cliente (editável)</label>
                <Input id="whatsapp-recipient-name" value={recipientName} maxLength={120} onChange={(event) => {
                  setRecipientName(event.target.value);
                  messageEdited.current = false;
                }} placeholder="Digite o nome que aparecerá na mensagem" className="mt-1.5 h-10 rounded-xl bg-background" />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="whatsapp-message" className="text-sm font-medium">Mensagem editável</label>
            <Textarea
              id="whatsapp-message"
              value={message}
              onChange={(event) => {
                messageEdited.current = true;
                setMessage(event.target.value);
              }}
              placeholder="Selecione uma conta para gerar a mensagem."
              maxLength={4096}
              rows={7}
              disabled={!selectedEntry}
              className="rounded-xl"
            />
            <p className="text-right text-xs text-muted-foreground">{message.length}/4096</p>
          </div>

          <div className="rounded-xl border bg-background p-4" aria-live="polite">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prévia exata que será aberta no WhatsApp</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{message || "A mensagem aparecerá aqui depois que você escolher uma conta."}</p>
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
