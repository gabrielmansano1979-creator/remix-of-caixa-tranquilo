import { useEffect, useRef, useState } from "react";
import { Headset, Send, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { askSupport } from "@/lib/support.functions";

type Msg = { role: "user" | "assistant"; content: string };

export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: "Olá! Sou o suporte do Critical Cash. Como posso ajudar?" }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = useServerFn(askSupport);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs, open]);

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    const next = [...msgs, { role: "user" as const, content: t }];
    setMsgs(next); setText(""); setBusy(true);
    try {
      const { reply } = await ask({ data: { messages: next.slice(1).slice(-20) } });
      setMsgs((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Não consegui responder agora. Tente novamente." }]);
    } finally { setBusy(false); }
  };

  return (
    <>
      {open && (
        <div role="dialog" aria-label="Chat de suporte" className="fixed bottom-24 right-4 z-50 flex h-[70vh] max-h-[520px] w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
          <div className="flex items-center justify-between bg-support px-4 py-3 text-support-foreground">
            <span className="flex items-center gap-2 font-semibold"><Headset className="h-5 w-5" />Suporte Critical Cash</span>
            <button onClick={() => setOpen(false)} aria-label="Fechar chat" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-support-foreground/15"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
            {msgs.map((m, i) => (
              <p key={i} className={m.role === "user" ? "ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary px-3 py-2 text-primary-foreground" : "max-w-[90%] whitespace-pre-wrap"}>{m.content}</p>
            ))}
            {busy && <p className="text-muted-foreground">Digitando…</p>}
            <div ref={end} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex gap-2 border-t p-3">
            <label htmlFor="support-input" className="sr-only">Sua mensagem</label>
            <input id="support-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva sua dúvida…" maxLength={2000}
              className="h-11 flex-1 rounded-xl border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Enviar" className="grid h-11 w-11 place-items-center rounded-xl bg-support text-support-foreground disabled:opacity-50"><Send className="h-4 w-4" /></button>
          </form>
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} aria-label={open ? "Fechar suporte" : "Abrir chat de suporte"}
        className="fixed bottom-20 right-4 z-50 grid h-14 w-14 place-items-center rounded-full bg-support text-support-foreground shadow-xl transition-transform hover:scale-105 md:bottom-6">
        {open ? <X className="h-6 w-6" /> : <Headset className="h-7 w-7" />}
      </button>
    </>
  );
}
