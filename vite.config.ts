import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { cytarioPlugins } from "./vite-plugins/cytario-plugins";
import { buildLocalDevelopmentConfig, parseCytarioLocalPaths } from "./vite-plugins/local-paths";

const localPaths = parseCytarioLocalPaths(process.env.CYTARIO_LOCAL_PATHS);

const missingEntryPoints = Object.entries(localPaths)
  .filter(([, directory]) => !existsSync(resolve(directory, "src/index.ts")))
  .map(([packageName, directory]) => `${packageName} → ${directory}/src/index.ts`);
if (missingEntryPoints.length > 0) {
  throw new Error(
    `CYTARIO_LOCAL_PATHS targets without src/index.ts: ${missingEntryPoints.join(", ")}`,
  );
}

const localDevelopment = buildLocalDevelopmentConfig(localPaths);

export default defineConfig({
  plugins: [cytarioPlugins(), tailwindcss(), reactRouter(), tsconfigPaths()],

  resolve: localDevelopment.resolve,

  optimizeDeps: {
    include: ["@codemirror/lang-json", "@codemirror/lang-yaml", "@uiw/react-codemirror"],
    exclude: localDevelopment.optimizeDepsExclude,
    // Explicit entries REPLACE the default scan (rollupOptions.input / html
    // files) and DROP its built-in **/__tests__** + coverage ignores, so the
    // app sources must be globbed back with those ignores re-applied,
    // alongside the excluded asset-URL deps' dist entries — whose runtime
    // graph (deck.gl → @probe.gl/stats, …) would otherwise be discovered at
    // request time and break dynamic imports with stale `?v=` hashes.
    entries: [
      ...localDevelopment.optimizeDepsEntries,
      "app/**/*",
      "!app/**/__tests__/**",
      "!app/**/*.test.*",
      "!app/**/*.spec.*",
      "!app/.generated/**",
    ],
  },
  ssr: {
    noExternal: localDevelopment.ssrNoExternal,
  },
  server: {
    port: 3000,
    fs: {
      allow: [".", ...localDevelopment.serverFsAllow],
    },
  },

  build: {
    target: ["chrome89", "firefox89", "safari15", "edge89"],
  },
});
