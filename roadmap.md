# Roadmap — Caixa Crítico

## Correções e validações (19/10/2026)
- [x] Banco ativo revisado: as migrations de documentos de parceiros e repasse constam no histórico do Supabase `dygwbadhvwzajordpmst`.
- [x] Esquema ativo contém `partner_application_documents` e a função `update_partner_payout(text, text)`.
- [x] Tipos gerados atuais incluem `partner_application_documents` e `update_partner_payout`; a anotação antiga de 22 erros de TypeScript não deve ser tratada como diagnóstico atual sem reproduzir o typecheck.
- [x] Banco ativo revisado: `profiles.trial_ends_at` usa prazo de 7 dias e `ensure_user_setup()` cria trial de 7 dias.
- [x] Criada nesta branch migration corretiva para que ambientes novos/reconstruídos mantenham o mesmo trial de 7 dias após a migration histórica de 03/10.
- [x] CI do commit de código validado: sintaxe das migrations, testes unitários, TypeScript e build passaram no GitHub Actions (run 39319301859). A versão publicada ainda não foi validada.
- [ ] Verificar os avisos dos Supabase Advisors e separar falsos positivos de funções SECURITY DEFINER que precisam de revisão individual. Não revogar permissões em lote sem confirmar os fluxos de autenticação e autorização.
- [ ] Confirmar no ambiente publicado que navegador e funções de servidor usam o backend esperado. Não alterar o login nem trocar de backend durante esta correção.

## Cobranças Pix (Asaas)
- [x] Vencimento do Pix nunca retroativo — `createPixCharge` envia a data de hoje em YYYY-MM-DD.
- [x] Vencimento no fuso de Brasília — `createPixCharge` usa a data de `America/Sao_Paulo`.
- [x] Esquema de cobrança confirmado no banco ativo — `pending_billing_changes` e `subscriptions.asaas_subscription_id` existem.
- [ ] Confirmar credenciais de produção, URL pública e eventos de webhook antes de habilitar cobranças reais.

## Login no Supabase próprio (dygwbadhvwzajordpmst)
- [x] Diagnóstico somente leitura: o código atual usa variáveis de ambiente e tem fallback para o Supabase próprio.
- [ ] Verificar o ambiente publicado e os redirects sem alterar telas ou configurações de login.

## Envio HTTP de WhatsApp
- [ ] Criar envio seguro por POST no servidor do app somente depois de avaliar custo e escolher provedor.
- [x] Para o MVP sem custo de API, manter preparação e envio manual pelo link oficial `wa.me`.

## Confirmação dos contatos do assinante
- [ ] Confirmar e-mail/celular apenas após definir um serviço de envio e verificar eventuais tarifas.

## Reformulação PLG — Critical Cash
- [x] Restaurar trial de 7 dias para novas contas e alinhar CTAs/preços/desconto Pix.
- [x] Reformular página inicial e prévias multicanal.
- [x] Persistir canais por etapa e implementar envio/status multicanal.
- [x] Cadastro e onboarding real em 3 passos.
- [x] Banner do trial, status e cobrança manual no painel.
- [x] Banco com regras de acesso, design system, layout, landing, autenticação, termos e privacidade.
- [x] Onboarding, Contas (+CSV), Caixa (projeção no banco), Lembretes, Planos, Assinatura e Configurações.
- [x] Pagamentos migrados para Asaas no fluxo principal; rotas legadas de Stripe ainda existem e não devem ser consideradas removidas.
- [ ] Verificar domínio de e-mail e agendamento diário.
- [ ] Revalidar testes de cadastro novo e envio externo.

## Aplicar repositório enviado
- [ ] Importar diferenças compatíveis do ZIP, sem credenciais ou arquivos gerados.
- [ ] Substituir administração simulada por permissões no servidor e parceiros persistidos, caso ainda existam caminhos não protegidos.
- [ ] Validar telas, pagamentos e testes da importação.
