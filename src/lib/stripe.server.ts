// Server-only: cliente Stripe via REST (compatível com Workers) e verificação de webhook.
import { createHmac, timingSafeEqual } from "node:crypto";
import { STRIPE_PRICE_IDS, type PlanId } from "@/config/plans";

export function priceId(plan: PlanId, interval: "month" | "year") {
  return process.env[`STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`] ?? STRIPE_PRICE_IDS[plan][interval];
}
export function planFromPrice(id: string): { plan: PlanId; interval: "month" | "year" } | null {
  for (const plan of Object.keys(STRIPE_PRICE_IDS) as PlanId[])
    for (const interval of ["month", "year"] as const) if (priceId(plan, interval) === id) return { plan, interval };
  return null;
}

function flatten(obj: Record<string, unknown>, prefix = "", out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === "object" ? flatten(item as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === "object") flatten(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe<T = any>(method: "GET" | "POST" | "DELETE", path: string, body?: Record<string, unknown>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_NOT_CONFIGURED");
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body ? flatten(body).toString() : undefined,
  });
  const j = await r.json();
  if (!r.ok) {
    console.error("stripe error", path, j?.error?.message);
    throw new Error("STRIPE_ERROR");
  }
  return j as T;
}

export function verifyStripeSignature(payload: string, header: string, secret: string, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"];
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const exp = createHmac("sha256", secret).update(`${t}.${payload}`).digest();
  return sigs.some((s) => {
    const b = Buffer.from(s, "hex");
    return b.length === exp.length && timingSafeEqual(b, exp);
  });
}
