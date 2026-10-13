# Auditoria do login — erro "Unsupported provider: missing OAuth secret"

## Causa comprovada

O erro vem do backend antigo (Lovable Cloud `zotsdccggybuufxwgomw`) e não do Supabase próprio.

Fiz um teste somente leitura, abrindo o início do login Google em cada backend, com o redirecionamento para `critical-cash.lovable.app/login`:

| Backend | Resposta |
|---|---|
| Antigo (`c--cd7fdc5c-…-prod.lovable.cloud`) | **400 — `Unsupported provider: missing OAuth secret`** (exatamente o erro relatado) |
| Próprio (`dygwbadhvwzajordpmst.supabase.co`) | **302 → accounts.google.com**: o Google já está configurado e funcionando |

O caminho que leva ao erro, passo a passo:
1. O código publicado do site contém só o host antigo. O host próprio não aparece em lugar nenhum.
2. Esse host vem dos valores reserva em `vite.config.ts`, linhas 11-20. Eles são usados porque as variáveis de conexão estão vazias no build.
3. `src/integrations/supabase/client.ts` (linhas 37-47) usa esses valores. Ele não tem nenhum host fixo próprio.
4. Os botões Google chamam o Google direto pelo Supabase (`supabase.auth.signInWithOAuth`) em dois lugares:
   - `src/routes/login.tsx:128`
   - `src/components/auth-shell.tsx:41` (`GoogleButton`), usado em `cadastro`, `esqueci-senha`, `redefinir-senha` e `configuracoes`.
5. No Lovable Cloud, o Google gerenciado só funciona pelo helper `src/integrations/lovable/index.ts`, que nenhuma tela usa. Pela chamada direta, o backend antigo não tem o segredo do Google e recusa o pedido.

## Qual backend cada login usa hoje

| Fluxo | Arquivo | Backend no publicado |
|---|---|---|
| Login com e-mail e senha | `login.tsx:105` (`signInWithPassword`) | Antigo |
| Cadastro | `login.tsx:85` e `cadastro.tsx:75` | Antigo |
| Recuperar senha | `esqueci-senha.tsx:35` | Antigo |
| Google | `login.tsx:128` e `auth-shell.tsx:41` | Antigo, o que gera o erro |
| Proteção das telas internas | `_authenticated/route.tsx:8` (`getUser`) | Antigo |
| Funções do servidor | `auth-middleware.ts:37`, `client.server.ts:33` (`SUPABASE_URL` do servidor) | Provavelmente o antigo (não confirmado) |
| `src/server.ts` | Só trata erros da página e não acessa o banco | — |
| `previewAuthStorage.ts` | Só decide onde a sessão fica guardada no preview. Não escolhe backend. | — |

O projeto `dygwbadhvwzajordpmst` aparece no código só em `supabase/config.toml:1`. O host antigo e o ID `zotsdccggybuufxwgomw` aparecem só em `vite.config.ts`.

## Ainda precisa de verificação

- Qual endereço de banco as funções do servidor publicado recebem de fato.
- Se a plataforma reinjeta as variáveis do Lovable Cloud no build e anula uma troca nos valores reserva.
- No Supabase próprio: se o endereço `https://critical-cash.lovable.app/login` está na lista de redirecionamentos permitidos (o teste mostrou que ele é aceito no início do fluxo), se o login por e-mail está ativo e se o esquema e as funções do painel existem.
- Se o backend antigo tem usuários reais que precisariam ser levados.

## Menor correção segura (não executada)

**Opção A — usar o Supabase próprio (é o seu objetivo).** O Google já funciona lá.
1. Você liga o Supabase próprio ao projeto em Configurações → Integrações, para que navegador e servidor troquem juntos.
2. Na mesma mudança, troco em `vite.config.ts` os três valores reserva para o host, a chave publicável e o ID do projeto próprio.
3. As telas de login não precisam mudar: a chamada direta do Google é a correta para um Supabase próprio.
4. Testo no preview com um dos 2 usuários existentes (e-mail e Google) antes de publicar.

Isso não perde dados do destino. O que existir só no backend antigo fica intacto, mas deixa de ser usado.

**Opção B — paliativo enquanto o app continua no Lovable Cloud.** Trocar só os dois botões Google para o helper gerenciado (`lovable.auth.signInWithOAuth`). Isso corrige o erro, mas mantém o login no backend antigo, contrário ao objetivo.

Recomendação: **Opção A**, conferindo antes o esquema e os redirecionamentos do destino.
