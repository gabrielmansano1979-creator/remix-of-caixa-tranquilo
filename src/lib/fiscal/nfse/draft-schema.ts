import { z } from "zod";

/**
 * Shared client/server validation for National NFS-e drafts.
 * cTribNac is the 6-digit National Taxation Code; CNAE is a separate 7-digit
 * economic activity code. Neither should be guessed from the description.
 */
const digitsOnly = (value: string) => value.replace(/\D/g, "");

export const nfseDraftSchema = z.object({
  user_id: z.string().uuid(),
  issuer_name: z.string().trim().min(2).max(180),
  issuer_cnpj: z.string().transform(digitsOnly).pipe(z.string().regex(/^\d{14}$/, "CNPJ deve conter 14 dígitos.")),
  issuer_city_ibge: z.string().transform(digitsOnly).pipe(z.string().regex(/^\d{7}$/, "Município IBGE deve conter 7 dígitos.")),
  recipient_name: z.string().trim().min(2).max(180),
  recipient_tax_id: z.string().transform(digitsOnly).pipe(z.string().regex(/^(\d{11}|\d{14})$/, "Informe CPF (11 dígitos) ou CNPJ (14 dígitos).")),
  service_description: z.string().trim().min(3).max(2000),
  amount_cents: z.number().int().positive().max(999999999999),
  competencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Competência deve estar no formato AAAA-MM-DD.")
    .refine(value => !Number.isNaN(Date.parse(value + "T00:00:00Z")), "Competência inválida."),
  codigo_trib_nacional: z.string().transform(digitsOnly).pipe(z.string().regex(/^\d{6}$/, "Código de Tributação Nacional deve conter 6 dígitos.")),
  cnae: z.string().transform(digitsOnly).pipe(z.string().regex(/^\d{7}$/, "CNAE deve conter 7 dígitos.")),
  iss_retido: z.boolean(),
  aliquota_iss: z.number().min(0).max(100).nullable().optional(),
}).superRefine((value, ctx) => {
  // For non-withheld ISS, require the rate. For withheld ISS, keep it optional
  // because withholding does not by itself establish the applicable rate.
  if (!value.iss_retido && (value.aliquota_iss === undefined || value.aliquota_iss === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["aliquota_iss"], message: "Informe a alíquota do ISS quando o imposto não for retido." });
  }
});

export type NfseDraftInput = z.infer<typeof nfseDraftSchema>;
