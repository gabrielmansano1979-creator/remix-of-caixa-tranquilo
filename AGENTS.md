# Instruções compartilhadas do projeto (CrieFy)

Antes de planejar ou alterar arquivos, leia `CLAUDE.md` integralmente. Ele contém as regras obrigatórias do produto, do template, da paleta e do fluxo de construção. O pedido textual do usuário define o produto; o template define somente o visual.

<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting published git history — force pushing, or rebasing/amending/squashing commits that are already pushed — as it rewrites history on Lovable's side and the user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application architecture

- Keep PLG trial defaults in database setup and client plan configuration together, so access and offers cannot diverge.
- Store new reminder deliveries with `stage_rule_id` and `channel`; keep legacy `rule_id` null on new deliveries to preserve per-channel idempotency without breaking historical records.
- Persist onboarding profile and financial inputs through authenticated database access; derive the semaphore from `cash_projection` rather than simulated state.
- Use the shared `ReminderPreview` for public examples and in-app previews, so both channel renderings remain consistent.

<!-- CRIEFY:MEMORIA:INICIO -->
# Memória do projeto (mantida pelo CrieFy)

Este arquivo é escrito automaticamente. Ele existe para que o trabalho continue consistente quando o motor de IA opera (Claude Code ↔ GPT Codex ↔ Antigravity).

**Leia antes de agir e não recomece o que já está feito.**

## O que já foi feito (Histórico de Turnos)

- **2026-10-02 — Clonagem e acesso ao repositório:** houve inicialmente erro 404 ao tentar localizar o repositório `remix-of-caixa-tranquilo` e erro 403 relacionado às permissões do token de acesso. Posteriormente, o repositório foi clonado e integrado com sucesso ao projeto.
- **2026-10-02 — Integração Asaas:** integração implementada nos arquivos e componentes do módulo Asaas, incluindo o módulo de API `src/lib/asaas.server.ts` e o webhook correspondente.
- **2026-10-02 — Configuração Asaas:** o arquivo `.env` já existia com a variável `ASAAS_API_KEY` vazia, pronta para ser configurada com segurança.
- **2026-10-02 — Sincronização com GitHub:** foi registrado um push anterior com atualizações dos arquivos de histórico e timeline. O commit informado naquele registro era `bb2acfb`.

## Imagens e Identidade Visual (DIRETRIZ OFICIAL CRIEFY)

1. **Prioridade de geração:** sempre que houver ferramenta de geração de imagem ativa (`.zheus/imagem.cjs` ou API nativa), priorize gerar ativos visuais exclusivos e fotorrealistas salvos em `assets/`.
2. **Bancos de imagens públicos e fallback:** caso a geração local por IA não esteja disponível, retorne erro ou o usuário solicite fotos reais, é permitido e recomendado utilizar fotos em alta resolução do Unsplash diretamente nas tags `<img>`, mantendo coerência absoluta com o nicho do projeto.
3. **Links fornecidos pelo criador:** sempre que o usuário fornecer URLs de imagens ou logos, incorpore-os com prioridade máxima.

## Aplicações e Sites com Geração de Imagem por IA

Se o site/projeto que você está criando for um SaaS de geração de imagens ou tiver botão "Gerar Imagem":

- O JavaScript do `index.html` deve fazer requisição para o endpoint nativo do servidor CrieFy:

  ```javascript
  const res = await fetch("/api/ai/generate-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: textoDoPrompt, aspectRatio: "1:1" })
  });
  const data = await res.json();
  const urlRealDaImagem = data.imageUrl;
  ```

- É proibido usar Pollinations.ai, Flux externo ou mocks. Use sempre a API nativa do CrieFy Imagen 3.

<!-- CRIEFY:MEMORIA:FIM -->S