import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],

  // Local @cytario/design development:
  // Skip pre-bundling so Vite serves the latest dist on every request.
  //
  // @duckdb/node-api: server-only native bindings. The package loads
  // platform-specific `.node` binaries at module top-level, which breaks
  // esbuild's dev-server dep pre-bundler (no loader for .node files) even
  // though the production build handles it fine via .server.ts tree-shaking.
  // Excluding it from optimizeDeps keeps pre-bundling away from it; Node
  // resolves it at runtime when loaders/actions actually execute.
  optimizeDeps: {
    exclude: ["@cytario/design", "@duckdb/node-api"],
  },
  // Process the design system through Vite's pipeline during SSR
  // instead of letting Node resolve it (avoids dual-React issues).
  ssr: {
    noExternal: ["@cytario/design"],
  },
  // Vite ignores node_modules by default — opt-in to watching
  // the design system so file changes trigger a reload.
  server: {
    watch: {
      ignored: ["!**/node_modules/@cytario/design/**"],
    },
  },

  build: {
    target: ["chrome89", "firefox89", "safari15", "edge89"],
  },
});
