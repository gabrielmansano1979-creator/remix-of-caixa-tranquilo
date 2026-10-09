import { useQuery } from "@tanstack/react-query";
import { accessQuery, usageQuery } from "@/lib/app-data";
import { USAGE_WARNING_RATIO } from "@/config/plans";

/** Direitos do plano no front (UX). O servidor revalida tudo (triggers/RPC/server functions). */
export function useEntitlements() {
  const access = useQuery(accessQuery);
  const usage = useQuery(usageQuery);
  const a = access.data;
  const u = usage.data;
  const ratio = (used: number, lim: number) => (lim ? used / lim : 0);
  return {
    loading: access.isLoading,
    access: a,
    usage: u,
    canWrite: a?.can_write ?? true,
    plan: a?.plan,
    limits: a?.limits,
    pendingNearLimit: !!a && !!u && ratio(u.pending_entries, a.limits.pending_entries) >= USAGE_WARNING_RATIO,
    trialDaysLeft: a?.status === "trialing" && a.trial_ends_at ? Math.max(0, Math.ceil((Date.parse(a.trial_ends_at) - Date.now()) / 86400000)) : null,
  };
}
