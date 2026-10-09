# CrieFy Design System — Padrão Dark Luxury

Referência completa de tokens, componentes e padrões visuais Dark Luxury utilizados no projeto.

---

## 1. Fundamentos

### Stack
- **HTML + Tailwind CSS** (via CDN)
- **Fonte:** Inter (wght 300–700) — `font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`
- **Fonte mono:** JetBrains Mono (para código/terminal)
- **Ícones:** Solar icon set (SVG inline, estilo bold-duotone)
- **Tema:** Dark-only (`bg-neutral-950`)
- **Anti-aliasing:** `antialiased` no body

---

## 2. Cores

| Token              | Valor / Classe          | Uso                                  |
|--------------------|-------------------------|--------------------------------------|
| Background         | `bg-neutral-950` #0a0a0a | Fundo principal                     |
| Surface Card       | `bg-neutral-900`         | Fundo de cards sólidos              |
| Glass Surface      | `bg-white/5 backdrop-blur`| Cards glass / containers flutuantes |
| Glass Surface Alt  | `bg-white/5 backdrop-blur-xl` | Botões glass                   |
| Text Primary       | `text-white`             | Títulos e texto principal           |
| Text Secondary     | `text-neutral-300`       | Corpo de texto, descrições          |
| Text Muted         | `text-neutral-400`       | Labels, textos auxiliares           |
| Text Subtle        | `text-neutral-500`       | Captions, font-mono labels         |
| Text Placeholder   | `text-neutral-600`       | Placeholder de inputs               |
| Accent             | `text-blue-400`          | Destaques, numeração de seções      |
| Accent Badge BG    | `bg-blue-400/15` ou `bg-blue-400/20` | Background de badges/pills |
| Accent Badge Text  | `text-blue-300`          | Texto de badges accent              |
| Error BG           | `bg-red-500/10`          | Fundo de error box                  |
| Error Border       | `border-red-500/20`      | Borda de error box                  |
| Error Text         | `text-red-300`           | Texto de mensagens de erro          |
| Border Sutil       | `border-white/10`        | Bordas de cards, inputs, divisores  |
| Border Seção       | `border-white/5`         | Divisores internos leves            |

---

## 3. Tipografia

| Estilo        | Classes Tailwind                                      | Uso                     |
|---------------|-------------------------------------------------------|-------------------------|
| Display H1    | `text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-tighter` | Hero / títulos de página |
| Heading H2    | `text-3xl sm:text-4xl md:text-5xl tracking-tighter`   | Títulos de seção        |
| Heading H3    | `text-3xl sm:text-4xl tracking-tighter`                | Subtítulos              |
| Page Title    | `text-3xl sm:text-4xl tracking-tighter`                | Título de tela (login)  |
| Section Title | `text-2xl font-semibold`                               | Títulos de seção DS     |
| Card Title    | `text-base tracking-tight font-semibold leading-none`  | Título dentro de card   |
| Body Large    | `text-base sm:text-lg text-neutral-300`                | Descrições, subtítulos  |
| Body Base     | `text-sm text-neutral-400`                             | Parágrafos, descrições  |
| Caption       | `text-xs text-neutral-400` ou `text-xs text-neutral-500` | Labels, meta info     |
| Label         | `text-sm font-medium text-neutral-300`                 | Labels de formulário    |
| Mono          | `font-mono text-xs text-neutral-500`                   | Código, nomes técnicos  |

---

## 4. Superfícies & Bordas

### Border Gradient (classe obrigatória: `.border-gradient`)
```css
.border-gradient {
  position: relative;
}
.border-gradient::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  background: linear-gradient(225deg,
    rgba(255,255,255,0.0) 0%,
    rgba(255,255,255,0.15) 50%,
    rgba(255,255,255,0.0) 100%);
  pointer-events: none;
}
```

### Card Glass (padrão principal)
```html
<div class="rounded-3xl border-gradient p-8 backdrop-blur"
     style="background: linear-gradient(225deg,
       rgba(255,255,255,0.0) 0%,
       rgba(255,255,255,0.05) 50%,
       rgba(255,255,255,0.0) 100%);
       border-radius: 24px;">
  <!-- conteúdo -->
</div>
```

### Card Feature (variação menor)
```html
<div class="rounded-2xl bg-white/5 ring-1 ring-white/10 p-5 border-gradient">
  <!-- conteúdo -->
</div>
```

### Card Stat (branco)
```html
<div class="rounded-3xl bg-white text-neutral-900 p-6 border-gradient"
     style="background: linear-gradient(225deg,
       rgba(255,255,255,0.95) 0%,
       rgba(255,255,255,1) 50%,
       rgba(255,255,255,0.95) 100%);
       border-radius: 24px;">
```

---

## 5. Backgrounds

### Grid Pattern (fundo fixo)
```html
<div class="fixed inset-0 -z-10 bg-neutral-950">
  <div class="absolute inset-0 opacity-[0.03]">
    <svg class="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern height="64" id="grid" patternUnits="userSpaceOnUse" width="64">
          <path d="M64 0H0v64" fill="none" stroke="white" stroke-width="0.5"/>
        </pattern>
      </defs>
      <rect fill="url(#grid)" height="100%" width="100%"/>
    </svg>
  </div>
</div>
```

### Glow Blobs (decorativos)
```html
<div class="pointer-events-none fixed -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-blue-500/[0.07] blur-3xl"></div>
<div class="pointer-events-none fixed -bottom-32 -right-32 h-[400px] w-[400px] rounded-full bg-blue-400/[0.05] blur-3xl"></div>
```

---

## 6. Componentes

### Botão Primário (branco)
```html
<button class="inline-flex items-center justify-center gap-2 rounded-full bg-white text-neutral-900 px-6 py-3 text-sm font-semibold shadow-[0_1px_0_0_rgba(255,255,255,0.4)_inset,0_1px_2px_rgba(0,0,0,0.2)] hover:-translate-y-0.5 transition-all"
        style="border-radius: 9999px;">
  Label
</button>
```
- Full width variant: adicionar `w-full` e `py-3.5`
- Disabled: `disabled:opacity-50 disabled:hover:translate-y-0`

### Botão Secundário (glass)
```html
<button class="inline-flex items-center gap-2 border-gradient hover:text-white transition-all hover:-translate-y-0.5 text-sm font-medium text-white/80 bg-white/5 rounded-full px-5 py-3 backdrop-blur-xl"
        style="border-radius: 9999px;">
  Label
</button>
```

### Input de Formulário
```html
<input class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-400/50 focus:border-blue-400/30 transition-all" />
```
- Autofill fix necessário:
```css
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus {
  -webkit-box-shadow: 0 0 0 40px #0a0a0a inset !important;
  -webkit-text-fill-color: #fff !important;
  caret-color: #fff;
}
```

### Error Box
```html
<div class="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-300">
  Mensagem de erro
</div>
```

### Pill / Badge
```html
<!-- Accent -->
<span class="inline-flex items-center rounded-full bg-blue-400/15 text-blue-300 px-2.5 py-1 text-xs font-medium border-gradient" style="border-radius: 9999px;">
  Label
</span>

<!-- Neutral -->
<span class="inline-flex items-center gap-1 text-[11px] border-gradient text-slate-300 bg-white/5 rounded-full px-2.5 py-1 backdrop-blur" style="border-radius: 9999px;">
  Label
</span>

<!-- Status com dot -->
<div class="inline-flex items-center gap-2 rounded-full border-gradient bg-white/5 px-3 py-1.5" style="border-radius: 9999px;">
  <span class="h-2 w-2 rounded-full bg-blue-400"></span>
  <span class="text-xs text-neutral-300 font-medium">Online</span>
</div>

<!-- Status com pulse -->
<div class="inline-flex items-center gap-2 rounded-full border-gradient bg-white/5 px-3 py-1.5 text-xs text-neutral-400" style="border-radius: 9999px;">
  <span class="h-2 w-2 rounded-full bg-blue-400 animate-pulse"></span>
  <span>Status text</span>
</div>
```

### Logo (ícone circular)
```html
<div class="inline-flex items-center justify-center bg-white/10 w-14 h-14 rounded-full backdrop-blur border-gradient" style="border-radius: 9999px;">
  <!-- SVG icon 24x24 -->
</div>
```
- Variação menor (nav): `w-9 h-9`, ícone 16x16

---

## 7. Layout

| Token                | Valor                                     |
|----------------------|-------------------------------------------|
| Container máximo     | `max-w-7xl`                               |
| Padding lateral      | `px-4 sm:px-6 lg:px-8`                   |
| Grid                 | 12 colunas (`lg`), 6 colunas (`md`)       |
| Centralizado (login) | `flex items-center justify-center` no body |
| Card max-width login | `max-w-md`                                |
| Separador de seções  | `border-t border-white/10`                |
| Espaçamento seção    | `py-20`                                   |

---

## 8. Animações

### fadeSlideIn (scroll/entrada)
```css
@keyframes fadeSlideIn {
  0% { opacity: 0; transform: translateY(30px); filter: blur(8px); }
  100% { opacity: 1; transform: translateY(0); filter: blur(0px); }
}
```

### fadeUp (mensagens/cards)
```css
@keyframes fadeUp {
  0% { opacity: 0; transform: translateY(12px); }
  100% { opacity: 1; transform: translateY(0); }
}
```

### Classes de animação
```css
.animate-in { animation: fadeSlideIn 0.8s ease-out both; }
.delay-1 { animation-delay: 0.1s; }
.delay-2 { animation-delay: 0.2s; }
.delay-3 { animation-delay: 0.3s; }
.delay-4 { animation-delay: 0.4s; }
```

### Hover lift (botões)
```
hover:-translate-y-0.5 transition-all
```

### Scroll observer (para animate-on-scroll)
Usa `IntersectionObserver` com `threshold: 0.2` e `rootMargin: "0px 0px -10% 0px"`.

---

## 9. Scrollbar
```css
::-webkit-scrollbar { width: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,.06); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.12); }
```

---

## 10. Regras Gerais

1. **Sempre dark theme** — nunca usar fundo branco em páginas (apenas em cards stat)
2. **Sempre usar `.border-gradient`** em cards, pills e containers glass
3. **Glass > flat** — preferir `bg-white/5 backdrop-blur` sobre `bg-neutral-900`
4. **`border-radius: inherit`** nos pseudo-elements — sempre usar `style="border-radius: Xpx"` no elemento pai quando usar `.border-gradient` para garantir herança
5. **Rounded tokens:** pills/botões = `rounded-full` (9999px), cards = `rounded-2xl` (16px) ou `rounded-3xl` (24px), inputs = `rounded-xl` (12px)
6. **Ícones** sempre Solar Bold Duotone, inline SVG
7. **Animações sequenciais** — usar delay incrementais (0.1s) para elementos que aparecem em cascata
8. **Inter** como fonte única para UI — JetBrains Mono apenas para código/terminal
9. **Componente Pix & Checkouts:** Sempre utilizar o SVG oficial com pontas arredondadas e cor `#32BCAD` (nunca emojis ou ícones genéricos). Em checkouts com SyncPay, o backend `server.mjs` deve conter a rota real lendo `process.env.SYNCPAY_KEY` e `process.env.SYNCPAY_SECRET`, gerando QR Code dinâmico em Base64 e código Pix Copia e Cola real.
   ```html
   <svg viewBox="0 0 512 512" width="22" height="22" fill="#32BCAD" xmlns="http://www.w3.org/2000/svg">
     <path d="M112.5 124.7l71.8-71.8c25.4-25.4 66.8-25.4 92.2 0l71.8 71.8c25.4 25.4 25.4 66.8 0 92.2L276.5 288.7c-25.4 25.4-66.8 25.4-92.2 0L112.5 216.9c-25.4-25.4-25.4-66.8 0-92.2zM235.5 329.7l71.8 71.8c25.4 25.4 66.8 25.4 92.2 0l71.8-71.8c25.4-25.4 25.4-66.8 0-92.2L399.5 165.7c-25.4-25.4-66.8-25.4-92.2 0l-71.8 71.8c-25.4 25.4-25.4 66.8 0 92.2zM124.7 399.5l71.8 71.8c25.4 25.4 66.8 25.4 92.2 0l71.8-71.8c25.4-25.4 25.4-66.8 0-92.2l-71.8-71.8c-25.4-25.4-66.8-25.4-92.2 0l-71.8 71.8c-25.4 25.4-25.4 66.8 0 92.2z"/>
   </svg>
   ```
