import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function UpgradeDialog({ open, onOpenChange, message }: { open: boolean; onOpenChange: (o: boolean) => void; message: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <span className="mb-2 grid h-11 w-11 place-items-center rounded-full bg-accent text-accent-foreground"><Sparkles className="h-5 w-5" /></span>
          <DialogTitle>Hora de crescer</DialogTitle>
          <DialogDescription>{message} Faça upgrade para continuar sem interrupções.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => onOpenChange(false)}>Agora não</Button>
          <Button asChild className="h-11 rounded-xl"><Link to="/assinatura">Fazer upgrade</Link></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
