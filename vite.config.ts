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

  resolve: {
    ...localDevelopment.resolve,
    // A file:-linked plugin (local harness, paired CI) resolves its own
    // @cytario/design from its own node_modules, whose react-aria-components
    // import then resolves to a second physical copy — two overlay stacks,
    // each ariaHideOutside pass inerts "everything outside my modal", so two
    // stacked modals (a plugin dialog + the host storage picker) both end up
    // inert with focus dead on <body>. Pin the shared runtime singletons to
    // this app's copies regardless of which node_modules tree they resolve
    // from; an npm-registry layout is a single tree already, so this is a
    // no-op there.
    dedupe: [
      "react",
      "react-dom",
      "react-aria-components",
      ...(localDevelopment.resolve?.dedupe ?? []),
    ],
  },

  optimizeDeps: {
    include: ["@codemirror/lang-json", "@codemirror/lang-yaml", "@uiw/react-codemirror"],
    exclude: localDevelopment.optimizeDepsExclude,
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
