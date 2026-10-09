# Caixa Crítico

Previsão de caixa (15/30 dias) + cobrança automática por e-mail. TanStack Start + Lovable Cloud.

## Secrets necessários (Lovable Cloud → Secrets)
| Nome | Uso |
|---|---|
| `ASAAS_API_KEY` | API privada do Asaas para Pix e cobrança automática |
| `RESEND_API_KEY` | Envio de e-mails |
| `RESEND_FROM_EMAIL` | Remetente verificado, ex.: `cobranca@seudominio.com.br` |
| `HMAC_SECRET` | Assina links de descadastro |
| `APP_URL` | URL pública, ex.: `https://app.seudominio.com.br` |
| `LOVABLE_API_KEY` | Conector oficial de WhatsApp Business |
| `WHATSAPP_API_KEY` | Chave do canal via conector |
| `WHATSAPP_TEMPLATE_NAME` | Opcional: template aprovado da Meta |
| `WHATSAPP_TEMPLATE_LANG` | Opcional: idioma do template, ex.: `pt_BR` |

## Fluxo de pagamento com Asaas
1. Configure a chave API do Asaas em `ASAAS_API_KEY` (sandbox ou produção).
2. Use o webhook público em `https://SEU_DOMINIO/api/public/asaas-webhook` para receber eventos de pagamento.
3. No Asaas, ative o rastreio de pagamentos para confirmar a cobrança Pix em segundos.
4. O checkout cria o cliente, gera o QR Code Pix e salva `asaas_payment_id` em `subscriptions` até a confirmação.

## E-mail e WhatsApp
- E-mail: Resend + `RESEND_API_KEY` e `RESEND_FROM_EMAIL`
- WhatsApp: conector `https://connector-gateway.lovable.dev/whatsapp` com `LOVABLE_API_KEY` e `WHATSAPP_API_KEY`
- O cron diário entra em `POST /api/public/send-reminders` para disparar regras de lembrete por canal

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
