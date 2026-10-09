# Roadmap — Caixa Crítico

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
