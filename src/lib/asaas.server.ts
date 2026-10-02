import { z } from "zod";

const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
const ASAAS_BASE_URL = "https://api.asaas.com.br/v3";

if (!ASAAS_API_KEY) {
  console.warn("ASAAS_API_KEY não configurada no .env");
}

async function asaasFetch<T>(path: string, options: RequestInit): Promise<T> {
  if (!ASAAS_API_KEY) throw new Error("NOT_CONFIGURED");

  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      access_token: ASAAS_API_KEY,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const error = await res.text().catch(() => "Erro na API Asaas");
    throw new Error(`Asaas API ${res.status}: ${error}`);
  }

  return res.json();
}

export async function createCustomer(email: string, name: string, cpfCnpj?: string) {
  return asaasFetch<{ id: string }>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: name || email.split("@")[0],
      email,
      cpfCpfCnpj: cpfCnpj,
    }),
  });
}

export async function getCustomerByEmail(email: string) {
  const data = await asaasFetch<{ data: Array<{ id: string; email: string }> }>(`/customers?email=${encodeURIComponent(email)}`, {
    method: "GET",
  });
  return data.data?.[0] ?? null;
}

export async function createPixCharge(customerId: string, amountCents: number, externalReference: string) {
  const amountBRL = (amountCents / 100).toFixed(2);
  return asaasFetch<{
    id: string;
    pixQrCode: string;
    pixCopyAndPaste: string;
    value: number;
    netValue: number;
  }>("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType: "PIX",
      value: amountBRL,
      dueDate: new Date().toISOString().split("T")[0],
      externalReference,
      split: [],
    }),
  });
}

export async function getPayment(paymentId: string) {
  return asaasFetch<{
    id: string;
    status: "PENDING" | "CONFIRMED" | "RECEIVED" | "OVERDUE";
    pixTransaction: string;
    value: number;
  }>(`/payments/${paymentId}`, {
    method: "GET",
  });
}