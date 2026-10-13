# Diagnóstico do login — Critical Cash (sem alterações)

## Causa comprovada

1. **O site publicado usa o backend antigo.** O código publicado de critical-cash.lovable.app (`/assets/utils-*.js`) contém apenas o host `c--cd7fdc5c-…-prod.lovable.cloud`, que é o Lovable Cloud `zotsdccggybuufxwgomw`. O host `dygwbadhvwzajordpmst.supabase.co` não aparece em nenhum ponto do código publicado. Por isso, os 2 usuários que estão no Supabase de destino não conseguem entrar: o login consulta outro banco de usuários.
2. **`vite.config.ts` (linhas 11-20):** quando as variáveis do build estão vazias, os valores reserva apontam para o host antigo, para a chave publicável antiga e para o ID `zotsdccggybuufxwgomw`. Neste ambiente, `.env` tem todas as variáveis `SUPABASE_*` e `VITE_SUPABASE_*` vazias, então esses valores reserva sempre vencem.
3. **`supabase/config.toml` (linha 1)** já declara `dygwbadhvwzajordpmst`. O resultado é uma configuração dividida: o arquivo aponta para um projeto, mas a conexão real usa outro.
4. **O login com Google usa a chamada direta do Supabase** (`supabase.auth.signInWithOAuth`) em `src/routes/login.tsx:128` e em `src/components/auth-shell.tsx:41`. O helper gerenciado (`src/integrations/lovable/index.ts`) não é usado. Num backend Lovable Cloud, a chamada direta não usa o Google gerenciado. No Supabase próprio, ela só funciona se o provedor Google estiver configurado lá, com o redirect `https://critical-cash.lovable.app/login` autorizado.

## Hipóteses (não comprovadas)

- **Servidor:** `src/integrations/supabase/client.server.ts` (linhas 33-34) e `auth-middleware.ts` (linhas 37-38) leem `SUPABASE_URL` e as chaves do ambiente de execução publicado. Provavelmente esse ambiente é injetado com o backend antigo. Se o navegador passar a usar o destino e o servidor continuar no antigo, as funções protegidas vão rejeitar os tokens: o token emitido por um backend é inválido no outro.
- **Variáveis reinjetadas:** a plataforma pode voltar a preencher `VITE_SUPABASE_*` com o Lovable Cloud a cada publicação. Isso anularia uma troca feita só nos valores reserva.
- **Esquema do destino:** não sei se o destino tem todas as tabelas, funções (`get_access`, `my_access`, `cash_projection`, `top_risks`, `ensure_user_setup`), triggers, RLS e grants. O login funcionaria mesmo assim, mas o painel pode quebrar logo depois.
- **Login com e-mail no destino:** não confirmei se o login por e-mail está ativo, se a confirmação de e-mail está ligada nem se o Site URL e os redirects estão corretos.

## Outros riscos no código de login

- `login.tsx:33`: o acesso de admin é decidido por um e-mail fixo e por `user_metadata.role`, que o próprio usuário pode editar. Isso redireciona para `/admin`. A proteção real precisa estar no servidor (`has_role`).
- `login.tsx:91`: o cadastro grava `role: 'caixa'` nos metadados. Hoje não causa dano, mas reforça o padrão inseguro acima.
- `login.tsx:38`: usa `window.location.replace`. Funciona, mas recarrega o app inteiro.

## Testes que faltam (somente leitura, antes de mudar)

1. Confirmar no ambiente publicado qual `SUPABASE_URL` as funções do servidor usam: por um log de inicialização, ou por uma função de diagnóstico que retorne só o host, nunca chaves.
2. No destino, conferir: login por e-mail ativo, provedor Google, Site URL e redirects permitidos, e se a confirmação de e-mail está ligada.
3. Comparar o esquema do destino com as 11 migrations Supabase e as 4 Drizzle (tabelas, funções, policies, grants).
4. Contar os usuários e dados do backend antigo, para saber se alguém além dos 2 usuários do destino usa o app hoje.
5. Depois da troca, fazer um teste ponta a ponta com um dos 2 usuários: login, abertura de `/caixa` e uma função protegida respondendo.

## Plano em etapas (aguarda sua autorização)

1. **Diagnóstico extra (somente leitura):** executar os testes 1 a 4. Sem eles, a troca pode deixar o painel quebrado.
2. **Alinhar o esquema do destino, se faltar algo:** aplicar só migrations aditivas (criar o que falta), sem apagar nem sobrescrever os 2 usuários, profiles e subscriptions existentes.
3. **Front:** trocar os valores reserva de `vite.config.ts` para a URL e a chave publicável do destino, e o ID para `dygwbadhvwzajordpmst`.
4. **Servidor:** registrar nos segredos do ambiente publicado `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e a chave de serviço do destino. Você precisa inserir essa chave; ela nunca entra no código. Também precisamos confirmar se a plataforma permite sobrepor essas variáveis num projeto com Lovable Cloud ativo. Se não permitir, o caminho é desconectar o Cloud, e isso é uma decisão sua.
5. **Google:** configurar o OAuth no Supabase de destino e manter a chamada direta já existente.
6. **Segurança:** trocar o redirecionamento de admin para usar `has_role` em vez de e-mail fixo e metadados.
7. **Webhooks e cron:** apontar Asaas, Stripe e os lembretes para o novo backend, para que pagamentos não sejam gravados no banco antigo.
8. **Publicar e testar** o login com os 2 usuários reais. O backend antigo fica intacto como plano de volta.

O menor caminho para o login voltar a funcionar são as etapas 3 e 4, junto com a etapa 5 se você quiser manter o Google. Ainda assim, a etapa 1 deve vir antes, para não trocar um problema de login por um painel quebrado.
