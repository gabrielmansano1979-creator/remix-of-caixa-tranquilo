import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, QrCode } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface PixPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  qrCode?: string;
  copyPaste?: string;
  paymentId?: string;
  amountCents?: number;
}

export function PixPaymentDialog({ open, onOpenChange, qrCode, copyPaste, paymentId, amountCents }: PixPaymentDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!copyPaste) return;
    try {
      await navigator.clipboard.writeText(copyPaste);
      setCopied(true);
      toast.success("Código Pix copiado!");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("Erro ao copiar código.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Pagamento via Pix</DialogTitle>
          <DialogDescription>Escaneie o QR Code ou copie o código Pix Copia e Cola para pagar.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {qrCode ? (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-xl border bg-white p-4">
                <img
                  src={`data:image/png;base64,${qrCode}`}
                  alt="QR Code Pix"
                  className="h-48 w-48"
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <QrCode className="h-4 w-4" />
                Escaneie com o app do seu banco
              </div>
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl border bg-muted">
              <p className="text-muted-foreground">Carregando QR Code...</p>
            </div>
          )}

          {copyPaste && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Pix Copia e Cola</label>
              <div className="flex gap-2">
                <textarea
                  readOnly
                  value={copyPaste}
                  className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-xs font-mono"
                  rows={3}
                />
                <Button
                  variant="outline"
                  className="h-auto shrink-0"
                  onClick={handleCopy}
                >
                  {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}

          {paymentId && (
            <p className="text-center text-xs text-muted-foreground">
              ID do pagamento: {paymentId}
            </p>
          )}

          <div className="rounded-xl bg-warning/10 p-3 text-sm text-warning">
            O pagamento será confirmado automaticamente em alguns segundos após a compensação do Pix.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}