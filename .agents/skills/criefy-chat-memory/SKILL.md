---
name: criefy-chat-memory
description: Persistência contínua de memória, contexto de histórico de chat e estado do projeto local. Use para consultar o histórico de conversas (.chat-history.json), marcos de evolução (.criefy/memoria.json, CLAUDE.md, AGENTS.md) e garantir continuidade sem perder o contexto do usuário entre turnos.
---

# CrieFy Chat Memory — Persistência e Continuidade de Diálogo

Esta skill instrui o agente a manter a memória ativa sobre conversas anteriores, decisões do usuário e arquivos existentes no projeto local.

## Diretrizes Mandatórias de Memória

1. **Contexto Permanente do Chat:**
   - O histórico completo das conversas do usuário está salvo no arquivo `.chat-history.json` na raiz do projeto.
   - Os marcos de evolução, decisões tomadas e resumo da arquitetura estão consolidados em `.criefy/memoria.json`, `CLAUDE.md` e `AGENTS.md`.
   - Se o usuário fizer perguntas de acompanhamento ("como combinamos antes", "por que você colocou aquele botão", "o que fizemos no último turno"), leia `.chat-history.json` ou `CLAUDE.md` para resgatar o contexto exato.

2. **Proibido Declarar Falta de Contexto:**
   - É expressamente proibido dizer ao usuário "não tenho contexto da conversa anterior", "perdi o histórico" ou "não sei o que combinamos".
   - Você tem acesso direto ao sistema de arquivos local do projeto. Use a ferramenta `Read` para ler `.chat-history.json` sempre que precisar resgatar mensagens mais antigas.

3. **Arquivos Locais Pré-Existentes:**
   - Em projetos com pasta local, todos os arquivos listados na raiz pertencem à aplicação ativa.
   - Antes de iniciar modificações ou responder a perguntas técnicas sobre o projeto, utilize `Glob` e `Read` para inspecionar os arquivos existentes no disco.
   - NUNCA solicite ao usuário para "enviar os arquivos do projeto" se a pasta local já possui código.
