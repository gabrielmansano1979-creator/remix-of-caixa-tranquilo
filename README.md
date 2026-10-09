# Caixa Crítico

Previsão de caixa (15/30 dias) e preparação de cobranças para envio manual pelo WhatsApp. TanStack Start + Lovable Cloud.

## Segredos necessários (Lovable Cloud → Secrets)
| Nome | Uso |
|---|---|
| `ASAAS_API_KEY` | API privada do Asaas para Pix e cobrança de assinatura |
| `APP_URL` | URL pública, por exemplo `https://app.seudominio.com.br` |

## Fluxo de pagamento com Asaas
1. Configure a chave API do Asaas em `ASAAS_API_KEY` (sandbox ou produção).
2. Use o webhook público em `https://SEU_DOMINIO/api/public/asaas-webhook` para receber eventos de pagamento.
3. No Asaas, ative o rastreio de pagamentos para confirmar a cobrança Pix em segundos.
4. O checkout cria o cliente, gera o QR Code Pix e salva `asaas_payment_id` em `subscriptions` até a confirmação.

## Cobranças pelo WhatsApp
- Selecione a conta e revise ou edite a mensagem antes de abrir o WhatsApp Web ou aplicativo.
- As mensagens são preparadas por links oficiais `wa.me`; o usuário confirma o envio no próprio WhatsApp.
- O projeto não envia e-mails transacionais nem mensagens de WhatsApp automaticamente. O e-mail permanece disponível para autenticação da conta.

## Regras no servidor
Limites e modo somente leitura são validados no banco (`get_access`, trigger `enforce_entry_limits`, `import_entries`) e nas server functions. `src/config/plans.ts` espelha `plan_limits` no SQL — altere os dois juntos.

## Checklist de publicação
- [ ] Trocar chaves Stripe de teste para produção (e novo webhook secret)
- [ ] Domínio próprio + `APP_URL`
- [ ] Revisar Termos e Privacidade (trechos entre colchetes)
- [ ] Testar: cadastro → trial → 1ª conta → cobrança manual via WhatsApp → assinatura → falha de pagamento → cancelamento → exclusão de conta
