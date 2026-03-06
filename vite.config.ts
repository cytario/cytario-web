import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],

  // Local @cytario/design development:
  // Skip pre-bundling so Vite serves the latest dist on every request.
  optimizeDeps: {
    exclude: ["@cytario/design"],
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
