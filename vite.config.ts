import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { cytarioPlugins } from "./vite-plugins/cytario-plugins";

export default defineConfig({
  plugins: [cytarioPlugins(), tailwindcss(), reactRouter(), tsconfigPaths()],

  // Local @cytario/design development:
  // Skip pre-bundling so Vite serves the latest dist on every request.
  optimizeDeps: {
    include: [
      "@codemirror/lang-json",
      "@codemirror/lang-yaml",
      "@uiw/react-codemirror",
      "@fideus-labs/worker-pool",
    ],
    // zarrextra and fizarrita ship worker entries resolved via import.meta.url;
    // flattening them into .vite/deps breaks those URLs, so serve them raw.
    exclude: ["@cytario/design", "zarrextra", "@fideus-labs/fizarrita"],
  },
  // Process the design system through Vite's pipeline during SSR
  // instead of letting Node resolve it (avoids dual-React issues).
  ssr: {
    noExternal: ["@cytario/design"],
  },
  // Vite ignores node_modules by default — opt-in to watching
  // the design system so file changes trigger a reload.
  server: {
    port: 3000,
    fs: {
      allow: [".", "../cytario-design"],
    },
    watch: {
      ignored: ["!**/node_modules/@cytario/design/**"],
    },
  },

  build: {
    target: ["chrome89", "firefox89", "safari15", "edge89"],
  },

  // @spatialdata's fizarrita codec worker is an ESM worker with dynamic
  // imports; Vite's default iife worker format rejects code-split builds.
  worker: {
    format: "es",
  },
});
