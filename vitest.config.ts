import dotenv from "dotenv";
import path from "path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Load environment variables from `.env.test`
dotenv.config({ path: ".env.test" });

// Plugin to handle ?url imports for WASM files in tests
const wasmUrlPlugin = () => ({
    name: "wasm-url-loader",
    transform(_code: string, id: string) {
        // Handle ?url imports for WASM files
        if (id.includes("?url") && id.includes(".wasm")) {
            const wasmPath = id.split("?")[0];
            // Return the actual file path for Node.js environment
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
        server: {
            deps: {
                inline: [
                    "@cornerstonejs/codec-openjpeg",
                    "@cytario/design",
                ],
            },
        },
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
