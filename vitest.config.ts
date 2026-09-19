import dotenv from "dotenv";
import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

dotenv.config({ path: ".env.test" });

// Handle ?url imports for WASM files in tests
const wasmUrlPlugin = () => ({
  name: "wasm-url-loader",
  transform(_code: string, id: string) {
    if (id.includes("?url") && id.includes(".wasm")) {
      const wasmPath = id.split("?")[0];
      return {
        code: `export default ${JSON.stringify(wasmPath)};`,
        map: null,
      };
    }
  },
});

export default defineConfig({
  plugins: [tsconfigPaths(), wasmUrlPlugin()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "app"),
    },
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
        inline: ["@cornerstonejs/codec-openjpeg", "@cytario/design"],
      },
    },
    coverage: {
      include: ["app/**"],
      exclude: [
        "**/__tests__/**",
        "**/.generated/**",
        "**/*.d.ts",
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
