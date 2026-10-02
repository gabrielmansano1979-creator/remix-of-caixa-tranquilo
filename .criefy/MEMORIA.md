# Memória do projeto (mantida pelo CrieFy)

Este arquivo é escrito automaticamente. Ele existe para que o trabalho
continue consistente quando o motor de IA opera (Claude Code ↔ GPT Codex ↔ Antigravity).
**Leia antes de agir e não recomece o que já está feito.**

## O que já foi feito (Histórico de Turnos)

- Turno: Usuário pediu "Clone esse repositório do github: https://github.com/gabrielmansano1979-creator/remix-of-caixa-tranquilo.git" → O repositório GitHub solicitado não foi encontrado (erro 404). Isso pode acontecer por dois motivos: 1. **Repositório privado**: O repositór _(criefy)_ — 2026-10-02
- Turno: Usuário pediu "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" → O token de acesso fornecido não possui permissão de leitura para este repositório (erro 403). Para clonar repositórios privados do GitHub, é _(criefy)_ — 2026-10-02
- Turno: Usuário pediu "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" → O repositório `remix-of-caixa-tranquilo` não foi encontrado (erro 404) mesmo com os três tokens PAT fornecidos. A API do GitHub confirma que _(criefy)_ — 2026-10-02
- Turno: Usuário pediu "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" → Repositório clonado e integrado com sucesso ao projeto. **O que foi feito:** - Clonagem do repositório `remix-of-caixa-tranquilo` realizada  _(criefy)_ — 2026-10-02
- Turno: Usuário pediu "Use o conector asaas para receber os pagamentos de forma automática" → Integração do Asaas concluída com sucesso. **O que foi implementado:** 1. **Módulo de integração Asaas** (`src/lib/asaas.server.ts`): Funçõe _(criefy)_ — 2026-10-02
- Turno: Usuário pediu "Continuar" → A integração do Asaas está completa e funcional. Todos os componentes foram implementados: módulo de API (`asaas.server.ts`), webhook de con _(criefy)_ — 2026-10-02

## Imagens e Identidade Visual (DIRETRIZ OFICIAL CRIEFY)

1. PRIORIDADE DE GERAÇÃO: Sempre que houver ferramenta de geração de imagem ativa (.zheus/imagem.cjs ou API nativa), priorize gerar ativos visuais exclusivos e fotorrealistas salvos em assets/.
2. BANCOS DE IMAGENS PÚBLICOS E FALLBACK: Caso a geração local por IA não esteja disponível, retorne erro ou o usuário solicite fotos reais, é TOTALMENTE PERMITIDO E RECOMENDADO utilizar fotos em alta resolução do Unsplash (https://images.unsplash.com/photo-...) diretamente nas tags <img>, mantendo coerência absoluta com o nicho do projeto.
3. LINKS FORNECIDOS PELO CRIADOR: Sempre que o usuário fornecer URLs de imagens ou logos, incorpore-os com prioridade máxima.

## Aplicações e Sites com Geração de Imagem por IA:
Se o site/projeto que você está criando for um SaaS de Geração de Imagens ou tiver botão "Gerar Imagem":
- O JavaScript do index.html DEVE fazer requisição para o endpoint nativo do servidor CrieFy:
  `const res = await fetch("/api/ai/generate-image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: textoDoPrompt, aspectRatio: "1:1" }) });`
  `const data = await res.json(); const urlRealDaImagem = data.imageUrl;`
- É TERMINANTEMENTE PROIBIDO USAR POLLINATIONS.AI, FLUX EXTERNO OU MOCKS. Use sempre a API nativa do CrieFy Imagen 3.
