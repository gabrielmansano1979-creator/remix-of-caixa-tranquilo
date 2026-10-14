# Roadmap — Caixa Crítico

## Cobranças Pix (Asaas)
- [x] Vencimento do Pix nunca retroativo — `createPixCharge` envia a data de hoje em YYYY-MM-DD (antes subtraía 3 horas)
- [x] Teste da regra de vencimento — seis testes aprovados no módulo Asaas
- [ ] Alinhar esquema do banco ao código de cobrança — `pending_billing_changes`, `accountant_access.checkout_reference` e `subscriptions.asaas_subscription_id` faltam no banco conectado; aguarda autorização do dono e a decisão sobre o Supabase próprio

## Login no Supabase próprio (dygwbadhvwzajordpmst)
- [x] Diagnóstico e levantamento somente leitura (site publicado usa backend antigo)
- [ ] Trocar navegador e servidor juntos — aguarda autorização do dono e vínculo do Supabase próprio nas configurações do projeto

## Envio HTTP de WhatsApp
- [ ] Criar envio seguro por POST no servidor do app — aguarda escolha entre Z-API e Meta Cloud API e credenciais no cofre.
- [ ] Priorizar alternativa gratuita de WhatsApp — verificar custos e distinguir envio manual de automação.

## Confirmação dos contatos do assinante
- [ ] Conectar Twilio para WhatsApp — aguarda conclusão da conexão segura pelo usuário.
- [ ] Confirmar e-mail e celular por códigos; WhatsApp via Twilio — aguarda conexão e configuração do serviço de confirmação.

## Reformulação PLG — Critical Cash
- [x] Restaurar trial de 7 dias para novas contas e alinhar CTAs/preços/desconto Pix
- [x] Reformular página inicial e prévias multicanal
- [x] Persistir canais por etapa e implementar envio/status multicanal
- [x] Cadastro e onboarding real em 3 passos
- [x] Banner do trial, status e cobrança manual no painel
- [x] Validar navegação pública/interna e regras: seis testes aprovados; envio externo e cadastro novo ainda não testados
- [ ] Ativar envio real: depende de domínio de e-mail e conexão WhatsApp Business

- [x] Banco com regras de acesso, design system, layout, landing, auth, termos/privacidade
- [x] Onboarding, Contas (+CSV), Caixa (projeção no banco), Lembretes, Planos, Assinatura, Configurações
- [x] Envio diário, descadastro HMAC, templates, e-mails do sistema, Stripe (checkout/portal/webhook)
- [x] Logo: ícone do app no lugar do quadradinho com "C"
- [x] Logo maior no cabeçalho (símbolo ~37px, antes 15px)
- [x] E-mail criticalcash2026@gmail.com visível: rodapé, chamada final, chat de suporte, menu do app, termos e privacidade
- [x] HMAC_SECRET disponível no cofre
- [x] Pagamentos migrados para Asaas (substitui pendência de Stripe)
- [ ] Domínio de e-mail e serviço de envio — aguarda configuração
- [ ] APP_URL e agendamento diário — não verificados neste turno

## Aplicar repositório enviado
- [ ] Importar diferenças compatíveis do ZIP, sem credenciais ou arquivos gerados
- [ ] Substituir administração simulada por permissões no servidor e parceiros persistidos
- [ ] Validar telas, pagamentos e testes da importação
