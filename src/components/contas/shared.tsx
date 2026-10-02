import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isOverdue, parseDbError, todaySP, type Entry } from "@/lib/app-data";

export function StatusBadge({ e }: { e: Entry }) {
  if (e.status === "paid") return <span className="inline-flex items-center gap-1 text-sm font-medium text-success"><CheckCircle2 className="h-4 w-4" />Pago</span>;
  if (isOverdue(e)) return <span className="inline-flex items-center gap-1 text-sm font-medium text-danger"><AlertTriangle className="h-4 w-4" />Atrasado</span>;
  return <span className="inline-flex items-center gap-1 text-sm font-medium text-warning"><Clock className="h-4 w-4" />Pendente</span>;
}

export function useMarkPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, paid }: { id: string; paid: boolean }) => {
      const { error } = await supabase.from("entries").update(paid ? { status: "paid", paid_at: todaySP() } : { status: "pending", paid_at: null }).eq("id", id);
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

