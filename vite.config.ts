// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     Nitro, VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Public (publishable) backend settings. Used only as a fallback when the build
// environment does not provide them, so the published site never boots blank.
const PUBLIC_BACKEND_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://dygwbadhvwzajordpmst.supabase.co";
const PUBLIC_BACKEND_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_Q9AJrQtfx-lcqNy8qaqYyg_-_oJMlWX";
const PUBLIC_BACKEND_PROJECT_ID =
  process.env.VITE_SUPABASE_PROJECT_ID || process.env.SUPABASE_PROJECT_ID || "dygwbadhvwzajordpmst";

export default defineConfig({
  // Critical Cash is hosted on a standard Node.js server, never on Cloudflare Workers.
  // Node is required for PKCS#12 certificate handling and node:https mTLS connections.
  nitro: { preset: "node-server" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(PUBLIC_BACKEND_URL),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(PUBLIC_BACKEND_KEY),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(PUBLIC_BACKEND_PROJECT_ID),
    },
  },
});
