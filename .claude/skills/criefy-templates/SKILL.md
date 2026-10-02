---
name: criefy-templates
description: Catálogo de templates do CrieFy — buscar, escolher, aplicar ou trocar template/tema do projeto. Use quando o usuário pedir um template/tema, quando o projeto não tem tema e merece um visual pronto, ou para listar os templates disponíveis.
---

# Templates do CrieFy — catálogo e aplicação

## Catálogo (fonte única)
Leia `/opt/zheus/themes/catalog.json` — todos os templates com id, pasta, categoria
(`design-system` = base visual completa | `site` = página pronta), tipo (`dark`/`light`/`component`)
e quais arquivos têm. NÃO varra as pastas manualmente para "comparar" — escolha pelo catálogo e aplique UM.

Como escolher pelo pedido: dashboard/app/sistema → `component` (sidebar, dashboard-list...);
landing/institucional/portfólio → `site`; base visual genérica → `design-system`.
Dark vs light: pelo tom do pedido (ou pergunte em 1 linha se for decisivo).

## Aplicar template como ponto de partida (projeto vazio)
```bash
cp -R "/opt/zheus/themes/<pasta>/." .
mkdir -p .references && mv design-system.html .references/ 2>/dev/null || true
```
Depois trabalhe em um dos DOIS MODOS:
- **Pedido do MESMO tipo do template** (landing sobre landing): adapte por **Edit** cirúrgico —
  reescreva todo o texto para o projeto pedido, nunca reescreva o arquivo inteiro.
- **Pedido de tipo DIFERENTE** (ex.: dashboard sobre landing): `mv index.html .references/site-original.html`
  e crie o novo index.html copiando o `<head>` do original (CSS, fontes, scripts) e reusando as
  classes, componentes e `assets/` do tema. O resultado deve parecer da mesma família visual.

## Trocar o template de projeto que JÁ tem trabalho
1. Confirme com o usuário o que preservar (textos, seções, dados) ANTES de mexer.
2. `mv index.html .references/versao-anterior.html`
3. Aplique o novo template (acima) e re-aplique o conteúdo preservado.

## Paleta
Paleta escolhida = editar as variáveis CSS / cores principais logo após aplicar o template
(edição cirúrgica; derive tons, sombras e gradientes das cores dadas).

## Regras
- `assets/` resolve imagens/fontes/ícones por caminho relativo — mantenha na raiz do projeto.
- Nenhum texto do template pode permanecer no resultado final.
- Código nunca vai para o chat; apenas 1–3 frases de status.
