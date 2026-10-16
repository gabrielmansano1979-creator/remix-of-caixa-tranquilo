# Auditoria Critical Cash — Diagnóstico e Plano por Etapas

Auditoria somente leitura executada: código, migrations, banco ativo, logs de build e nomes de secrets (sem valores). Nenhum arquivo, dado, configuração ou publicação foi alterado.

## Diagnóstico priorizado (com evidências)

### P1 — Build do preview quebrado (bloqueia publicação)
- `src/routes/contador.tsx` e `src/routes/admin/index.tsx` referenciam a tabela `partner_application_documents` e a função `update_partner_payout`, que **não existem no banco ativo** (confirmado por consulta: só existe `partner_requests`; nenhuma função `*payout*`).
- As migrations `20261013182900_partner_application_documents.sql` e `20261013183100_partner_payout_and_document_security.sql` existem no repositório, mas **não foram aplicadas** ao banco conectado. Os tipos gerados (`types.ts`) também não contêm essa tabela, gerando dezenas de erros TS.
- Impacto: preview com erros de compilação; painéis admin/contador não compilam.

### P2 — Fluxo Pix/Asaas: esquema de cobrança agora existe
- Contrariando o diagnóstico anterior, o banco ativo **já possui** `pending_billing_changes` e `subscriptions.asaas_subscription_id` (confirmado por consulta). A migration `20261014140000_reconcile_billing_checkout_runtime.sql` aparentemente foi aplicada.
- `dueDate` já está corrigida (`new Date().toISOString().slice(0, 10)`, sem subtrair horas) — `asaas.server.ts:93`.
- Ressalva (hipótese): `dueDate` em UTC pode marcar "amanhã" entre 21h e meia-noite no horário de Brasília; avaliar troca para data em `America/Sao_Paulo`.
- `requireSupabaseAuth` usa `supabase.auth.getClaims(token)` — método fora da API padrão do supabase-js v2; precisa de verificação em runtime (pode ser a causa de falhas silenciosas de autenticação nas server functions).
- Secrets presentes no cofre (nomes apenas): `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `HMAC_SECRET`, `LOVABLE_API_KEY`, `LOVABLE_CRON_SECRET`. **Faltam:** `APP_URL` (usado em links de descadastro/webhook) — a confirmar uso; Stripe legado sem secrets (código morto, `STRIPE_PRICE_IDS` com placeholders `_REPLACE`).

### P3 — Trial: confirmado 7 dias no banco ativo
- `profiles.trial_ends_at` tem default `now() + 7 days` no banco ativo (confirmado). Frontend: `TRIAL_DAYS = 7` em `src/config/plans.ts`.
- Inconsistência no repositório: a migration `20261003042123` zera o trial (`SET DEFAULT now()`), mas o estado ativo é 7 dias — ou seja, essa migration não reflete o banco. Risco: se as migrations forem reaplicadas em outro ambiente, o trial zera. Recomenda-se uma migration corretiva explícita para 7 dias.
- Banco ativo: 4 profiles, 5 subscriptions (4 trialing, 1 pending_pix), 0 linhas em `user_roles` (nenhum admin cadastrado — painel admin inacessível até promover um usuário).

### P4 — Itens menores
- Código Stripe residual (`src/lib/stripe.server.ts`, webhook Stripe, `STRIPE_PRICE_IDS`) sem uso efetivo — candidato a remoção ou desativação formal.
- `plan_limits` existe no banco e espelha `src/config/plans.ts` (manter sincronizados, regra já registrada no AGENTS.md).
- Prevenção de auto-indicação em afiliados compara e-mail/tax_id, contornável com documentos diferentes (risco baixo).

## Plano de implementação por etapas (cada etapa só após sua aprovação)

### Etapa 1 — Destravar o build (sem tocar no banco)
- Arquivos: `src/routes/contador.tsx`, `src/routes/admin/index.tsx`, `src/integrations/supabase/types.ts`.
- Opção A (recomendada): aplicar as migrations de `partner_application_documents` + `update_partner_payout` no banco e regenerar os tipos — mantém as telas de documentos de parceiros.
- Opção B: remover/neutralizar temporariamente os trechos que usam a tabela inexistente.
- Testes: suíte Vitest existente (63 testes) + typecheck. Sem custo. **Preciso da sua escolha entre A e B.**

### Etapa 2 — Robustecer checkout Pix
- Arquivos: `src/lib/asaas.server.ts` (dueDate em fuso de Brasília), `src/integrations/supabase/auth-middleware.ts` (verificar/corrigir `getClaims`), testes novos em `src/lib/asaas.server.test.ts`.
- Sem cobranças reais; testes com mocks. Custo zero.

### Etapa 3 — Alinhar trial e limpar legado
- Migration corretiva garantindo trial de 7 dias (idempotente), remoção do código Stripe morto, definição de `APP_URL` no cofre (você adiciona o valor em Project Settings → Secrets).
- Tabelas: `profiles` (apenas default), nenhum dado alterado.

### Etapa 4 — Verificação ponta a ponta
- Login de teste, geração de Pix em sandbox Asaas (sem cobrança real), webhook com token, painéis admin/contador após promover um usuário a admin (preciso que você indique qual conta).

## Riscos
- Aplicar migrations fora de ordem pode zerar o trial (migration de 03/10) — por isso a Etapa 3 inclui corretiva.
- Promover admin exige inserir linha em `user_roles` (ação sua ou com sua aprovação explícita).
- Publicar antes da Etapa 1 deixa o site no ar com erros de compilação.

## Aprovações necessárias
1. Etapa 1: opção A (aplicar migrations) ou B (neutralizar telas)?
2. Posso executar as migrations no banco conectado quando chegar a hora?
3. Qual conta deve virar admin na Etapa 4?
