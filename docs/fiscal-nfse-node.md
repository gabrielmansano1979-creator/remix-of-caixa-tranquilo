# NFS-e Nacional — execução e segredos

## Runtime

O Critical Cash deve executar em um servidor Node.js padrão, não Cloudflare Workers/Pages. O build Nitro usa o preset `node-server` e gera `.output/server/index.mjs`.

- Build: `npm run build`
- Inicialização: `npm start`
- Use uma versão Node.js compatível com TanStack Start e o lockfile do projeto.

## Segredos obrigatórios no ambiente do servidor

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — exclusivamente no servidor; nunca usar prefixo `VITE_`.
- `FISCAL_ENCRYPTION_KEY` — 32 bytes aleatórios codificados em base64. Gerar com `openssl rand -base64 32` e guardar em um gestor de segredos. Não versionar nem armazenar no banco.

A chave deve ser diferente por ambiente. Faça backup seguro e planeje rotação por `encryption_key_version`; perder a chave torna os certificados armazenados irrecuperáveis.

## Certificados A1

Criptografe o arquivo PKCS#12 e a senha separadamente com AES-256-GCM, nonce aleatório e tag de autenticação. O AAD associa cada segredo ao tenant, configuração e campo, impedindo mover ciphertext entre empresas/colunas. Não registre arquivo, senha, ciphertext, passphrase ou conteúdo fiscal em logs.

A tabela `configuracoes_fiscais` não concede acesso direto a `anon` ou `authenticated`. Leitura e gravação devem passar por handlers de servidor que autenticam a sessão e autorizam o usuário/contador para a empresa antes de usar a service role.

## APIs nacionais

Emissão SEFIN e consultas/compartilhamento ADN são APIs distintas; não trate `nfse.gov.br` como uma URL de API universal. O cliente inicial usa hosts fixos documentados para SEFIN Nacional restrita e produção. Implemente operações conforme Swagger, XSD e notas técnicas oficiais vigentes. Nunca marque uma nota como emitida sem confirmação oficial e chave de acesso retornada.

## Estado desta implementação

Esta base fornece o alvo Node, schema seguro de configuração e primitives server-only para criptografia e inicialização mTLS. Ainda não representa emissão fiscal concluída: faltam handlers autenticados de upload/validação de certificado, construção e assinatura XML/DPS, validação por XSD, chamadas SEFIN/ADN, persistência de protocolo/retorno e testes de homologação com certificado autorizado.
