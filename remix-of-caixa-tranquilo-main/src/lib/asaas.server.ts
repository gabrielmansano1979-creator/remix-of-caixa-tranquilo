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

export async function updateCustomerDoc(id: string, cpfCnpj: string) {
  return asaasFetch<{ id: string }>(`/customers/${id}`, { method: "PUT", body: JSON.stringify({ cpfCnpj }) });
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
  return asaasFetch<{ id: string; status: string; value: number }>(`/payments/${paymentId}`);
}
