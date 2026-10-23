import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Secure server entry point for NFS-e emission.
 * This repository uses TanStack Start server functions (not Remix route actions).
 * The POST-only transport and auth middleware are enforced by createServerFn.
 */
const emissionInput = z.object({
  invoiceId: z.string().uuid(),
  tenantUserId: z.string().uuid(),
  configId: z.string().uuid(),
});

export const emitNfseAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => emissionInput.parse(data))
  .handler(async ({ data, context }) => {
    const requestId = crypto.randomUUID();
    const userId = context.userId;

    try {
      // Revalidate with Supabase Auth, rather than trusting a client-supplied user ID.
      const { data: authData, error: authError } = await context.supabase.auth.getUser();
      if (authError || !authData.user || authData.user.id !== userId) {
        throw Object.assign(new Error("UNAUTHENTICATED"), { status: 401 });
      }

      const { invoiceId, tenantUserId, configId } = data;
      const isOwner = authData.user.id === tenantUserId;
      let hasTenantPermission = false;

      if (!isOwner) {
        // The RPC derives permissions from the authenticated database identity.
        // It never accepts a caller-supplied actor ID.
        const { data: allowed, error: permissionError } = await context.supabase
          .rpc("can_access_fiscal_invoices", { _client_user_id: tenantUserId });
        if (permissionError) {
          // Fail closed: an unavailable permission check must never grant access.
          console.error("[nfse.emit] tenant permission lookup failed", {
            requestId, actorUserId: userId, tenantUserId, code: permissionError.code,
          });
          throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        }
        hasTenantPermission = allowed === true;
      }

      if (!isOwner && !hasTenantPermission) {
        throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
      }

      // Use admin only after caller identity and tenant permission have been checked.
      const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
      const { data: config, error: configError } = await db
        .from("configuracoes_fiscais")
        .select("id,tenant_user_id,status")
        .eq("id", configId)
        .eq("tenant_user_id", tenantUserId)
        .maybeSingle();

      if (configError || !config || config.status !== "ativo") {
        throw Object.assign(new Error("FISCAL_CONFIG_NOT_FOUND"), { status: 404 });
      }

      const { data: invoice, error: invoiceError } = await db
        .from("fiscal_invoices")
        .select("id,user_id,document_type,status")
        .eq("id", invoiceId)
        .eq("user_id", tenantUserId)
        .maybeSingle();

      if (invoiceError || !invoice || invoice.document_type !== "nfse") {
        throw Object.assign(new Error("INVOICE_NOT_FOUND"), { status: 404 });
      }

      // No blind retries. The emission service must consult the official DPS state
      // before any retransmission after an uncertain network outcome.
      const { emitNfseForTenant } = await import("./nfse-emission.server");
      return await emitNfseForTenant({ invoiceId, tenantUserId, configId });
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status: unknown }).status)
        : 0;

      if (status === 401 || (error instanceof Error && error.message === "UNAUTHENTICATED")) {
        throw new Error("Sua sessão expirou. Entre novamente.");
      }
      if (status === 403 || (error instanceof Error && error.message === "FORBIDDEN")) {
        throw new Error("Você não tem permissão para emitir notas fiscais desta empresa.");
      }
      if (status === 404 || (error instanceof Error && ["INVOICE_NOT_FOUND", "FISCAL_CONFIG_NOT_FOUND"].includes(error.message))) {
        throw new Error("Nota fiscal ou configuração fiscal não encontrada.");
      }
      if (error instanceof Error && error.message.startsWith("DPS_INCOMPLETE:")) {
        console.warn("[nfse.emit] blocked emission: incomplete fiscal payload", {
          requestId, actorUserId: userId, invoiceId: data.invoiceId, tenantUserId: data.tenantUserId,
        });
        throw new Error("A emissão ainda não está disponível: faltam dados fiscais obrigatórios para montar a DPS Nacional. Nenhum envio foi realizado.");
      }

      console.error("[nfse.emit] emission failed", {
        requestId,
        actorUserId: userId,
        invoiceId: data.invoiceId,
        tenantUserId: data.tenantUserId,
        configId: data.configId,
        errorName: error instanceof Error ? error.name : "UnknownError",
        // Deliberately omit error.message, request bodies, XML, PFX and passwords.
      });
      throw new Error("Não foi possível concluir a emissão da NFS-e. Consulte o status antes de tentar novamente.");
    }
  });
