import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isOverdue, parseDbError, todaySP, type Entry } from "@/lib/app-data";

export function StatusBadge({ e }: { e: Entry }) {
  if (e.status === "paid") return <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-3 py-1.5 text-xs font-semibold text-success"><CheckCircle2 className="h-3.5 w-3.5" />Pago</span>;
  if (isOverdue(e)) return <span className="inline-flex items-center gap-1.5 rounded-full border border-danger/20 bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger"><AlertTriangle className="h-3.5 w-3.5" />Atrasado</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning"><Clock className="h-3.5 w-3.5" />Pendente</span>;
}

export function useMarkPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: boolean }) => {
      const { error } = await supabase.from("entries").update(paid ? { status: "paid", paid_at: new Date().toISOString() } : { status: "pending", paid_at: null }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, paid }) => {
      await qc.cancelQueries({ queryKey: ["entries"] });
      const prev = qc.getQueryData<Entry[]>(["entries"]);
      qc.setQueryData<Entry[]>(["entries"], (old) => old?.map((e) => (e.id === id ? { ...e, status: paid ? "paid" : "pending", paid_at: paid ? todaySP() : null } : e)));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      qc.setQueryData(["entries"], ctx?.prev);
      toast.error(parseDbError(e).message);
    },
    onSuccess: (_d, v) => toast.success(v.paid ? "Marcada como paga." : "Reaberta."),
    onSettled: () => { qc.invalidateQueries({ queryKey: ["entries"] }); qc.invalidateQueries({ queryKey: ["projection"] }); qc.invalidateQueries({ queryKey: ["risks"] }); },
  });
}
