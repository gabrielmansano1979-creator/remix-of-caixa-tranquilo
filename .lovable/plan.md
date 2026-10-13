# Diagnóstico e plano seguro: tornar `dygwbadhvwzajordpmst` o backend principal

## Diagnóstico (o que existe hoje)

- **Backend que atende o app hoje:** o Lovable Cloud gerenciado (ref `zotsdccggybuufxwgomw`). É lá que estão hoje as contas, os lançamentos, as assinaturas, os parceiros e as comissões. Um único backend atende o preview e o site publicado.
- **`vite.config.ts`:** os valores reserva apontam para o host `c--cd7fdc5c-...-prod.lovable.cloud`, para a chave publicável do backend atual e para o project ID `zotsdccggybuufxwgomw`. É a única referência fixa no código aos dois identificadores.
- **`src/integrations/supabase/client.ts`:** é gerado pela plataforma. Ele lê primeiro `VITE_SUPABASE_*` e depois `window.__CRIEFY_ENV__`. Ele não contém nenhum host fixo.
- **`.env`:** tem as variáveis `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_*`, mas todas vazias neste ambiente. Esse arquivo é gerenciado pela plataforma.
- **`supabase/config.toml`:** já declara `project_id = "dygwbadhvwzajordpmst"`. O código atual tem essa divergência: o arquivo indica um projeto, mas a conexão real usa outro.
- **Login com Google:** passa pelo broker gerenciado (`@lovable.dev/cloud-auth-js`), que só funciona com o backend Lovable Cloud. Num projeto Supabase próprio, o broker não funciona. Seria preciso configurar um OAuth do Google próprio e trocar a chamada.
- **Funções do servidor, webhooks Asaas/Stripe, envio de lembretes e cron:** usam `SUPABASE_URL` e a chave de serviço injetadas no servidor (`client.server.ts`, `cron-auth.ts`). Trocar o fallback do front não muda o servidor: elas continuariam gravando no backend atual.
- **Drizzle:** usa `LOVABLE_DB_MIGRATION_URL`, uma credencial gerenciada que aponta para o backend atual. Há 11 migrations Supabase e 4 Drizzle, e as duas trilhas precisam ser aplicadas.

## Resposta direta: trocar os fallbacks basta?

**Não. Fazer só isso é arriscado.**
1. O front passaria a usar o novo projeto, mas as funções do servidor, os webhooks e o cron continuariam no backend atual. Os dados ficariam divididos entre os dois.
2. As contas não migram com a troca de URL. Os usuários, as senhas e as sessões estão em `auth.users` do backend atual, e todo mundo seria deslogado ou "não encontrado".
3. Se o esquema do novo projeto não for idêntico ao atual, o app quebra. Isso inclui tabelas, enums, funções como `cash_projection`, `get_access` e `top_risks`, triggers, RLS e grants.
4. O login com Google para de funcionar.
5. Os fallbacks só valem quando as variáveis do build estão vazias. A plataforma pode reinjetar os valores do Lovable Cloud e sobrescrever a troca.
6. A plataforma não oferece uma forma suportada de desconectar o Lovable Cloud de um projeto e apontá-lo para outro Supabase. É preciso confirmar isso antes de executar.

## Plano seguro (só executar após aprovação)

1. **Inventário (somente leitura):** contar as linhas por tabela e os usuários do backend atual, para comparar depois.
2. **Verificar o projeto de destino:** confirmar acesso ao `dygwbadhvwzajordpmst`, o estado atual dele (vazio ou com dados) e a chave publicável correta. A chave de serviço fica só no cofre de segredos.
3. **Replicar o esquema:** aplicar todas as migrations, das duas trilhas, no destino. Depois comparar tabelas, funções, policies, grants e triggers.
4. **Migrar os dados com preservação de IDs:** exportar `auth.users` com os hashes de senha e `auth.identities`, e importar no destino mantendo os mesmos UUIDs. Depois copiar as tabelas `public` respeitando a ordem das chaves estrangeiras (profiles → partner_requests → coupons, entries etc.).
5. **Validar:** contagens idênticas, login de teste com senha e checagem de RLS com um usuário real.
6. **Reconfigurar os serviços:** Google OAuth próprio (redirect para o novo domínio de autenticação), URLs de redirect e e-mail, segredos do servidor (URL, chave de serviço, Asaas, Stripe, cron) e URLs dos webhooks no Asaas e no Stripe. Recriar o agendamento diário de lembretes.
7. **Código:** trocar os fallbacks em `vite.config.ts`, trocar o login Google para a chamada direta e alinhar a configuração do Drizzle.
8. **Virada:** congelar escritas por pouco tempo, fazer uma sincronização final dos dados, publicar e monitorar. O backend atual fica intacto como plano de volta.

## Pontos a confirmar com você

- O projeto `dygwbadhvwzajordpmst` está vazio ou já tem dados?
- Você tem acesso de administrador a ele, para gerar as credenciais e aplicar o esquema?
- Aceita reconfigurar o login com Google por conta própria?
