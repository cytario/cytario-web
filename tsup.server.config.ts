import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

// Compile server.ts → ./server.js. Node 24 refuses to type-strip files under
// node_modules/, so the published tarball must ship a plain JS entry.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  entry: { server: "server.ts" },
  outDir: ".",
  format: ["esm"],
  target: "node24",
  platform: "node",
  external: Object.keys(pkg.dependencies ?? {}),
  sourcemap: true,
  splitting: false,
});
