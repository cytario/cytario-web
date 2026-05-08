import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

import { GENERATED_PATH, generatePluginsModule, parseCytarioPluginsEnv } from "../bin-src/codegen";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const FULL_PATH = resolve(ROOT, GENERATED_PATH);

/**
 * Regenerate `app/plugins.generated.ts` from CYTARIO_PLUGINS at config
 * resolve + buildStart. Only writes on change to avoid HMR cascades.
 * Invalid entries fail the build.
 */
export function cytarioPlugins(): Plugin {
  let didWrite = false;

  const writeIfChanged = () => {
    if (didWrite) return;
    const input = parseCytarioPluginsEnv(process.env.CYTARIO_PLUGINS);
    const next = generatePluginsModule(input);
    const current = existsSync(FULL_PATH) ? readFileSync(FULL_PATH, "utf8") : "";
    if (current !== next) {
      writeFileSync(FULL_PATH, next, "utf8");
    }
    didWrite = true;
  };

  return {
    name: "cytario:plugins-codegen",
    enforce: "pre",
    configResolved() {
      writeIfChanged();
    },
    buildStart() {
      didWrite = false;
      writeIfChanged();
    },
  };
}
