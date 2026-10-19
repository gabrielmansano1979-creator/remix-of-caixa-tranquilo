# Roadmap — Caixa Crítico

## Cobranças Pix (Asaas)
- [x] Diagnosticar falha de produção, corrigir tratamento do checkout e testar sem cobranças reais
- [x] Vencimento do Pix nunca retroativo — `createPixCharge` envia a data de hoje em YYYY-MM-DD (antes subtraía 3 horas)
- [x] Vencimento no fuso de Brasília — `createPixCharge` usa a data de America/Sao_Paulo (antes UTC virava "amanhã" após 21h); 64 testes aprovados
- [x] Esquema de cobrança confirmado no banco ativo — `pending_billing_changes` e `subscriptions.asaas_subscription_id` existem (revalidado em 16/10)
- [ ] Aplicar migrations de `partner_application_documents` e `update_partner_payout` + regenerar tipos — 22 erros de typecheck em `contador.tsx`/`admin/index.tsx`; aguarda autorização do dono (mudança de banco)
- [x] Migration corretiva do trial: nova migration define 14 dias no backend para novas contas, sem alterar datas de trials existentes.

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
- [x] Configurar trial de 14 dias para novas contas e alinhar os textos da experiência.
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
