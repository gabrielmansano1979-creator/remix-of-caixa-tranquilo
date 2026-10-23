// Integração Asaas. A chave é lida a cada chamada (variáveis só existem dentro do handler).
function config() {
  const key = process.env["ASAAS_API_KEY"];
  if (!key) throw new Error("NOT_CONFIGURED");
  // Chaves de teste começam com $aact_hmlg_ e usam o ambiente sandbox.
  const base = key.includes("_hmlg_") ? "https://api-sandbox.asaas.com/v3" : "https://api.asaas.com/v3";
  return { key, base };
}

export class AsaasApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly operation: string, public readonly safeDescription: string) {
    super(`ASAAS_${status}:${code}`);
    this.name = "AsaasApiError";
  }
}

function safeProviderError(body: unknown) {
  const candidate = body && typeof body === "object" && "errors" in body ? body.errors : null;
  const first = Array.isArray(candidate) ? candidate[0] : null;
  const rawCode = first && typeof first === "object" ? first.code : null;
  const descriptions: Record<string, string> = {
    invalid_cpfCnpj: "CPF/CNPJ recusado",
    invalid_cpf_cnpj: "CPF/CNPJ recusado",
    invalid_customer: "Dados do titular recusados",
    invalid_dueDate: "Vencimento recusado",
    invalid_due_date: "Vencimento recusado",
    invalid_value: "Valor recusado",
    invalid_access_token: "Acesso recusado",
    invalid_action: "Operação recusada",
    invalid_object: "Dados da operação recusados",
  };
  const code = typeof rawCode === "string" && Object.hasOwn(descriptions, rawCode) ? rawCode : "provider_rejected";
  return { code, description: descriptions[code] ?? "O provedor recusou a solicitação; detalhes pessoais omitidos" };
}

async function asaasFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { key, base } = config();
  // Never log query strings (email/reference) or resource IDs.
  const operation = `${options.method ?? "GET"} ${path.split("?")[0].replace(/\/(customers|payments|subscriptions)\/[^/]+/g, "/$1/:id")}`;
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "User-Agent": "CriticalCash", access_token: key, ...options.headers },
    signal: options.signal ?? AbortSignal.timeout(20000),
    });
  } catch {
    console.error("asaas request failed", { operation, status: 0, code: "network_error", message: "Resposta não confirmada" });
    throw new AsaasApiError(0, "network_error", operation, "Resposta não confirmada");
  }
  let body: unknown;
  try { body = JSON.parse(await res.text()); } catch { body = null; }
  if (!res.ok) {
    const safe = safeProviderError(body);
    console.error("asaas request rejected", { operation, status: res.status, code: safe.code, message: safe.description });
    throw new AsaasApiError(res.status, safe.code, operation, safe.description);
  }
  if (!body || typeof body !== "object") {
    console.error("asaas response invalid", { operation, status: res.status, code: "invalid_response", message: "Resposta inválida" });
    throw new AsaasApiError(res.status, "invalid_response", operation, "Resposta inválida");
  }
  return body as T;
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

export async function getCustomerDocument(id: string) {
  const customer = await asaasFetch<{ id: string; cpfCnpj?: string | null }>(`/customers/${encodeURIComponent(id)}`);
  return customer.cpfCnpj ?? null;
}

export async function createPixCharge(customerId: string, amountCents: number, externalReference: string, description: string) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) throw new RangeError("PIX amount must be positive safe integer cents");
  const payment = await asaasFetch<{ id: string; value: number }>("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType: "PIX",
      value: Number((amountCents / 100).toFixed(2)),
      // Data de hoje no fuso de Brasília (nunca retroativa nem "amanhã" após 21h BRT).
      dueDate: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()),
      externalReference,
      description,
    }),
  });
  if (!payment.id) throw new AsaasApiError(200, "invalid_response", "POST /payments", "Identificação da cobrança ausente");
  const qr = await getPixQrCode(payment.id);
  return { id: payment.id, ...qr, value: payment.value };
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
  if (!qr.encodedImage || !qr.payload) throw new Error("PIX_QR_UNAVAILABLE");
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
export async function updateAsaasSubscriptionAmount(subscriptionId: string, amountCents: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new RangeError("subscription amount must be a positive safe integer in cents");
  }
  await asaasFetch<{ id: string }>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "PUT",
    body: JSON.stringify({ value: Number((amountCents / 100).toFixed(2)) }),
  });
  const pending = await asaasFetch<{ data?: Array<{ id: string; value?: number; status?: string }> }>(
    `/payments?subscription=${encodeURIComponent(subscriptionId)}&status=PENDING&limit=100`,
  );
  for (const payment of pending.data ?? []) {
    if (payment.status && payment.status !== "PENDING") continue;
    if (Math.round(Number(payment.value ?? 0) * 100) === amountCents) continue;
    await asaasFetch<{ id: string }>(`/payments/${encodeURIComponent(payment.id)}`, {
      method: "PUT",
      body: JSON.stringify({ value: Number((amountCents / 100).toFixed(2)) }),
    });
  }
}

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
