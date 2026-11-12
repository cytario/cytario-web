import dotenv from "dotenv";
import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

dotenv.config({ path: ".env.test" });

// Handle ?url imports for static assets (WASM, DuckDB's worker JS) in tests:
// inlined deps run through this pipeline; externalized ones are denied by
// vite's module server before plugins ever see them.
const assetUrlPlugin = () => ({
  name: "asset-url-loader",
  transform(_code: string, id: string) {
    if (id.includes("?url") && (id.includes(".wasm") || id.includes(".worker.js"))) {
      const assetPath = id.split("?")[0];
      return {
        code: `export default ${JSON.stringify(assetPath)};`,
        map: null,
      };
    }
  },
});

export default defineConfig({
  plugins: [tsconfigPaths(), assetUrlPlugin()],
  resolve: {
    // A git worktree's node_modules is a symlink into the sibling checkout;
    // resolving realpaths would move every dependency outside the vite root
    // and vite's module server denies their ?url imports (DuckDB's worker
    // JS, pdfjs's worker). Keeping the symlinked path keeps them inside.
    preserveSymlinks: true,
    alias: {
      "~": path.resolve(__dirname, "app"),
    },
    // A linked @cytario/design (CYTARIO_LOCAL_PATHS / file: install) resolves
    // react from its own node_modules — a second react instance breaks hooks
    // in happy-dom. Pin the singletons to this app's copies.
    dedupe: ["react", "react-dom"],
  },
  assetsInclude: ["**/*.wasm"],
  test: {
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    silent: true,
    environment: "happy-dom",
    include: [
      "app/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "__tests__/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "bin/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "bin-src/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "scripts/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "vite-plugins/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "packages/**/*.{test,spec}.?(c|m)[jt]s?(x)",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
    server: {
      deps: {
        inline: ["@cornerstonejs/codec-openjpeg", "@cytario/design", "@duckdb/duckdb-wasm"],
      },
    },
    coverage: {
      include: ["app/**"],
      exclude: [
        "**/__tests__/**",
        "**/.generated/**",
        "**/*.d.ts",
        "**/*.md",
        "**/types.ts",
        "**/*.types.ts",
        "**/routes.ts",
        "**/env.ts",
        "**/config.ts",
        "**/*.worker.js",
        "**/db/redis.ts",
      ],
      reporter: ["json-summary", "lcov", "text"],
      reportsDirectory: "./coverage",
    },
  },
});
