import dotenv from "dotenv";
import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Load environment variables from `.env.test`
dotenv.config({ path: ".env.test" });

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "app"),
    },
  },
  test: {
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    silent: true,
    environment: "happy-dom",
    coverage: {
      include: ["app/**"], // Include only the app directory
      exclude: [
        "**/__tests__/**", // Exclude test files themselves
        "**/.generated/**", // Exclude generated code (Prisma, etc.)
        "**/*.d.ts", // Exclude type declarations
        "**/types.ts", // Exclude general types
        "**/*.types.ts", // Exclude general types
        "**/routes.ts", // Exclude env config
        "**/env.ts", // Exclude env config
        "**/config.ts", // Exclude static config
        "**/*.worker.js", // Exclude WebWorker files
        "**/db/redis.ts", // Exclude Redis DB file
      ],
      reporter: ["json-summary", "lcov", "text"],
      reportsDirectory: "./coverage",
    },
  },
});
