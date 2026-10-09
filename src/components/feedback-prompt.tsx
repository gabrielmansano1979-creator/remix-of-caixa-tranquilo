import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const DAYS = 3;

export function FeedbackPrompt({ createdAt }: { createdAt?: string | null }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!createdAt) return;
    if (Date.now() - new Date(createdAt).getTime() < DAYS * 86400000) return;
    let cancel = false;
    supabase.from("app_feedback").select("id").limit(1).then(({ data, error }) => {
      if (!cancel && !error && (data?.length ?? 0) === 0) setOpen(true);
    });
    return () => { cancel = true; };
  }, [createdAt]);

  const save = async (dismissed: boolean) => {
    setSaving(true);
    const { error } = await supabase.from("app_feedback").insert({
      rating: dismissed ? null : rating,
      comment: dismissed ? null : comment.trim().slice(0, 2000) || null,
      dismissed,
    });
    setSaving(false);
    if (error) { toast.error("Não foi possível enviar. Tente novamente."); return; }
    setOpen(false);
    if (!dismissed) toast.success("Obrigado pela avaliação!");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) save(true); }}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Como está sendo sua experiência?</DialogTitle>
          <DialogDescription>Avalie o Critical Cash de 1 a 5 estrelas.</DialogDescription>
        </DialogHeader>
        <div className="flex justify-center gap-2 py-2" role="radiogroup" aria-label="Nota">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className="rounded-lg p-1 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Star className={`h-9 w-9 ${(hover || rating) >= n ? "fill-primary text-primary" : "text-muted-foreground"}`} />
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="fb-comment">O que podemos melhorar?</Label>
          <Textarea id="fb-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={4} placeholder="Conte o que faria o app ser ainda mais útil para você" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => save(true)} disabled={saving}>Agora não</Button>
          <Button onClick={() => save(false)} disabled={saving || rating === 0}>{saving ? "Enviando…" : "Enviar avaliação"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
