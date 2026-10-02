# Caixa Crítico

Previsão de caixa (15/30 dias) + cobrança automática por e-mail. TanStack Start + Lovable Cloud.

## Secrets necessários (Lovable Cloud → Secrets)
| Nome | Uso |
|---|---|
| `STRIPE_SECRET_KEY` | API do Stripe (sk_test_… / sk_live_…) |
| `STRIPE_WEBHOOK_SECRET` | Assinatura do webhook (whsec_…) |
| `STRIPE_PRICE_<PLANO>_<MONTH\|YEAR>` | Opcional: sobrescreve os IDs em `src/config/plans.ts` |
| `STRIPE_PAYMENT_METHODS` | Opcional, ex.: `card,boleto` |
| `RESEND_API_KEY` | Envio de e-mails |
| `RESEND_FROM_EMAIL` | Remetente verificado, ex.: `cobranca@seudominio.com.br` |
| `HMAC_SECRET` | Assina links de descadastro |
| `APP_URL` | URL pública, ex.: `https://app.seudominio.com.br` |

## Stripe (modo teste)
1. Crie 3 produtos (Starter, Pro, Business), cada um com preço mensal e anual em BRL (29/290, 59/590, 119/1.190).
2. Cole os `price_…` em `STRIPE_PRICE_IDS` (`src/config/plans.ts`) ou nos secrets.
3. Webhook → `https://SEU_DOMINIO/api/public/stripe-webhook` com eventos: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid`, `invoice.payment_failed`. Copie o `whsec_…`.
4. Customer Portal: ative troca de plano (com proração), atualização de cartão, faturas e cancelamento.

## Resend
Adicione e verifique seu domínio (SPF/DKIM) no Resend e defina `RESEND_FROM_EMAIL`.

## Agendamento diário (08:00 America/Sao_Paulo = 11:00 UTC)
Rota: `POST /api/public/send-reminders` com `Authorization: Bearer <LOVABLE_CRON_SECRET>`. Envia a régua e os e-mails do sistema (boas-vindas, fim do teste).

## Regras no servidor
Limites e modo somente leitura são validados no banco (`get_access`, trigger `enforce_entry_limits`, `import_entries`) e nas server functions. `src/config/plans.ts` espelha `plan_limits` no SQL — altere os dois juntos.

## Checklist de go-live
- [ ] Trocar chaves Stripe de teste para produção (e novo webhook secret)
- [ ] Domínio próprio + `APP_URL`
- [ ] Domínio do Resend verificado
- [ ] Revisar Termos e Privacidade (trechos entre colchetes)
- [ ] Testar: cadastro → trial → 1ª conta → lembrete → assinatura → falha de pagamento → cancelamento → exclusão de conta
