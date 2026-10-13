// Integração Asaas. A chave é lida a cada chamada (variáveis só existem dentro do handler).
function config() {
  const key = process.env["ASAAS_API_KEY"];
  if (!key) throw new Error("NOT_CONFIGURED");
  // Chaves de teste começam com $aact_hmlg_ e usam o ambiente sandbox.
  const base = key.includes("_hmlg_") ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
  return { key, base };
}

async function asaasFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { key, base } = config();
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "User-Agent": "CriticalCash", access_token: key, ...options.headers },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`Asaas ${res.status} ${path}: ${text}`);
    let desc = "";
    try { desc = JSON.parse(text)?.errors?.[0]?.description ?? ""; } catch { /* ignore */ }
    throw new Error(`ASAAS_${res.status}:${desc}`);
  }
  return JSON.parse(text) as T;
}

export async function createCustomer(email: string, name: string, cpfCnpj: string) {
  return asaasFetch<{ id: string }>("/customers", {
    method: "POST",
    body: JSON.stringify({ name: name || email.split("@")[0], email, cpfCnpj }),
  });
}

export async function updateCustomerDoc(id: string, cpfCnpj: string, name?: string) {
  const payload = {
    cpfCnpj,
    ...(name?.trim() ? { name: name.trim() } : {}),
  };
  return asaasFetch<{ id: string }>(`/customers/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function getCustomerByEmail(email: string) {
  const data = await asaasFetch<{ data: Array<{ id: string; email: string }> }>(`/customers?email=${encodeURIComponent(email)}`);
  return data.data?.[0] ?? null;
}

export async function createPixCharge(customerId: string, amountCents: number, externalReference: string, description: string) {
  const payment = await asaasFetch<{ id: string; value: number }>("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType: "PIX",
      value: Number((amountCents / 100).toFixed(2)),
      dueDate: new Date(Date.now() - 3 * 3600000).toISOString().split("T")[0],
      externalReference,
      description,
    }),
  });
  const qr = await asaasFetch<{ encodedImage: string; payload: string }>(`/payments/${payment.id}/pixQrCode`);
  return { id: payment.id, pixQrCode: qr.encodedImage, pixCopyAndPaste: qr.payload, value: payment.value };
}

export async function getPayment(paymentId: string) {
  return asaasFetch<{
    id: string;
    status: string;
    value: number;
    subscription?: string | null;
    externalReference?: string | null;
    dueDate?: string | null;
    customer?: string | null;
  }>(`/payments/${paymentId}`);
}

export async function getPixQrCode(paymentId: string) {
  const qr = await asaasFetch<{ encodedImage: string; payload: string }>(`/payments/${paymentId}/pixQrCode`);
  return { pixQrCode: qr.encodedImage, pixCopyAndPaste: qr.payload };
}

export async function findPaymentByExternalReference(externalReference: string) {
  const result = await asaasFetch<{
    data?: Array<{
      id: string;
      status: string;
      externalReference?: string | null;
      value?: number;
    }>;
  }>(`/payments?externalReference=${encodeURIComponent(externalReference)}&limit=100`);
  return (result.data ?? []).find((payment) => payment.externalReference === externalReference) ?? null;
}


export async function deletePayment(paymentId: string) {
  return asaasFetch<{ deleted: boolean }>(`/payments/${paymentId}`, { method: "DELETE" });
}

export type AsaasBillingCycle = "MONTHLY" | "YEARLY";

type AsaasSubscription = {
  id: string;
  externalReference?: string | null;
  status?: string;
};

async function findSubscriptionByExternalReference(externalReference: string) {
  const result = await asaasFetch<{ data?: AsaasSubscription[] }>(
    `/subscriptions?externalReference=${encodeURIComponent(externalReference)}&limit=100`,
  );
  return (result.data ?? []).find((item) => item.externalReference === externalReference) ?? null;
}

/**
 * Creates a PIX recurrence or recovers the matching subscription after a
 * webhook retry. externalReference makes the remote creation retry-safe.
 */
export async function createOrGetPixSubscription(
  customerId: string,
  amountCents: number,
  nextDueDate: string,
  cycle: AsaasBillingCycle,
  externalReference: string,
  description: string,
) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new RangeError("recurring amount must be a positive safe integer in cents");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate)) {
    throw new RangeError("nextDueDate must use YYYY-MM-DD");
  }
  const [year, month, day] = nextDueDate.split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year
    || calendarDate.getUTCMonth() + 1 !== month
    || calendarDate.getUTCDate() !== day
  ) {
    throw new RangeError("nextDueDate must be a real calendar date");
  }

  const existing = await findSubscriptionByExternalReference(externalReference);
  if (existing) {
    if (existing.status && existing.status !== "ACTIVE") {
      throw new Error("ASAAS_SUBSCRIPTION_NOT_ACTIVE:" + existing.id);
    }
    return { id: existing.id, externalReference };
  }

  const subscription = await asaasFetch<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType: "PIX",
      value: Number((amountCents / 100).toFixed(2)),
      nextDueDate,
      cycle,
      externalReference,
      description: description.slice(0, 500),
    }),
  });
  if (!subscription.id) throw new Error("ASAAS_SUBSCRIPTION_ID_MISSING");
  return { id: subscription.id, externalReference };
}

/**
 * Ends an Asaas recurrence and removes its pending or overdue invoices. Paid
 * invoices remain in Asaas. Local access can still be retained through the
 * application's current_period_end timestamp.
 */
export async function cancelAsaasSubscription(subscriptionId: string) {
  try {
    return await asaasFetch<{ deleted: boolean }>(`/subscriptions/${subscriptionId}`, { method: "DELETE" });
  } catch (error) {
    // A webhook retry may reach this after the previous attempt already removed the old recurrence.
    if (error instanceof Error && error.message.startsWith("ASAAS_404")) {
      return { deleted: true, alreadyRemoved: true };
    }
    throw error;
  }
}
