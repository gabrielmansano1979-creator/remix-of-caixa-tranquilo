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
  empresaTenantId: z.string().uuid(),
  configId: z.string().uuid().optional(),
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

      const { invoiceId, empresaTenantId } = data;
      const isOwner = authData.user.id === empresaTenantId;
      if (!isOwner) {
        if (authData.user.user_metadata?.account_type !== "accountant") {
          throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        }
        const { data: link, error: linkError } = await (context.supabase as any)
          .from("contador_empresas")
          .select("id")
          .eq("contador_user_id", userId)
          .eq("empresa_tenant_id", empresaTenantId)
          .eq("status", "ativo")
          .maybeSingle();
        if (linkError || !link) {
          console.error("[nfse.emit] accountant authorization denied", {
            requestId, actorUserId: userId, empresaTenantId, code: linkError?.code,
          });
          throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
        }
      }

      // Use admin only after caller identity and tenant permission have been checked.
      const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
      const { data: invoice, error: invoiceError } = await db
        .from("fiscal_invoices")
        .select("id,user_id,document_type,status,issuer_cnpj")
        .eq("id", invoiceId)
        .eq("user_id", empresaTenantId)
        .maybeSingle();

      if (invoiceError || !invoice || invoice.document_type !== "nfse") {
        throw Object.assign(new Error("INVOICE_NOT_FOUND"), { status: 404 });
      }

      // The browser cannot read configuracoes_fiscais (service-role only). Resolve
      // the active configuration server-side by the draft's issuer CNPJ.
      let configQuery = db
        .from("configuracoes_fiscais")
        .select("id,tenant_user_id,status")
        .eq("tenant_user_id", empresaTenantId)
        .eq("status", "ativo");
      if (data.configId) {
        configQuery = configQuery.eq("id", data.configId);
      } else {
        configQuery = configQuery.eq("cnpj", String(invoice.issuer_cnpj ?? "").replace(/\D/g, ""));
      }
      const { data: config, error: configError } = await configQuery.maybeSingle();

      if (configError || !config || config.status !== "ativo") {
        throw Object.assign(new Error("FISCAL_CONFIG_NOT_FOUND"), { status: 404 });
      }

      // No blind retries. The emission service must consult the official DPS state
      // before any retransmission after an uncertain network outcome.
      const { emitNfseForTenant } = await import("./nfse-emission.server");
      const { error: actorUpdateError } = await db.from("fiscal_invoices")
        .update({ emitido_por_user_id: userId })
        .eq("id", invoiceId)
        .eq("user_id", empresaTenantId);
      if (actorUpdateError) throw new Error("Não foi possível registrar o responsável pela emissão.");

      await db.from("fiscal_emission_audit").insert({
        tenant_user_id: empresaTenantId, invoice_id: invoiceId, actor_user_id: userId,
        request_id: requestId, event_type: "emission_started",
        details: { config_id: config.id, actor_is_company_owner: isOwner },
      });

      let result;
      try {
        result = await emitNfseForTenant({ invoiceId, tenantUserId: empresaTenantId, configId: config.id });
      } catch (emissionError) {
        await db.from("fiscal_emission_audit").insert({
          tenant_user_id: empresaTenantId, invoice_id: invoiceId, actor_user_id: userId,
          request_id: requestId, event_type: "emission_failed",
          details: { error_name: emissionError instanceof Error ? emissionError.name : "UnknownError" },
        });
        throw emissionError;
      }

      // Return actionable validation feedback to the UI without turning missing
      // draft fields into a generic server error. No request is sent in this case.
      if ("ok" in result) {
        console.info("[nfse.emit] draft needs fiscal fields", {
          requestId,
          actorUserId: userId,
          invoiceId,
          missingFields: result.missingFields.map(({ field }) => field),
        });
        await db.from("fiscal_emission_audit").insert({
          tenant_user_id: empresaTenantId, invoice_id: invoiceId, actor_user_id: userId,
          request_id: requestId, event_type: "emission_incomplete",
          details: { missing_fields: result.missingFields.map(({ field }) => field) },
        });
        return result;
      }

      await db.from("fiscal_emission_audit").insert({
        tenant_user_id: empresaTenantId, invoice_id: invoiceId, actor_user_id: userId,
        request_id: requestId,
        event_type: result.accepted && result.accessKey ? "emission_succeeded" : "emission_rejected",
        details: { status_code: result.statusCode, accepted: result.accepted, has_access_key: Boolean(result.accessKey) },
      });

      // Only return serializable, user-safe status fields. The raw SEFIN body is
      // persisted server-side and must not cross the Server Function boundary.
      return {
        ok: true as const,
        accepted: result.accepted,
        accessKey: result.accessKey ?? null,
        protocol: result.protocol ?? null,
        statusCode: result.statusCode,
        rejectionReason: result.rejectionReason ?? null,
      };
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
      console.error("[nfse.emit] emission failed", {
        requestId,
        actorUserId: userId,
        invoiceId: data.invoiceId,
        empresaTenantId: data.empresaTenantId,
        configId: data.configId ?? "resolved-server-side",
        errorName: error instanceof Error ? error.name : "UnknownError",
        // Deliberately omit error.message, request bodies, XML, PFX and passwords.
      });
      throw new Error("Não foi possível concluir a emissão da NFS-e. Consulte o status antes de tentar novamente.");
    }
  });
