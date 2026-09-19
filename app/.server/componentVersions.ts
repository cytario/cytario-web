import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { parseCytarioPluginsEnv } from "../../bin-src/codegen";

export interface ComponentVersion {
  package: string;
  version: string;
}

export interface ComponentVersions {
  /** The running assembly: cytario-ee in EE deployments, @cytario/web in OSS. */
  assembly: { package: string; version: string };
  /** Bundled components beyond the assembly: @cytario/web and plugins (EE only). */
  components: ComponentVersion[];
}

export type PackageResolver = (pkg: string) => string;

const defaultResolve: PackageResolver = createRequire(import.meta.url).resolve;

let cache: ComponentVersions | undefined;

/** Test hook: drop the memoized result. */
export function __resetComponentVersions() {
  cache = undefined;
}

// In EE the assembly is cytario-ee (VERSION env) and the web + plugin manifests
// resolve from node_modules; in OSS the assembly is @cytario/web itself and no
// manifests resolve.
export async function getComponentVersions(
  resolve: PackageResolver = defaultResolve,
): Promise<ComponentVersions> {
  if (cache) return cache;

  const packages = ["@cytario/web", ...parseCytarioPluginsEnv(process.env.CYTARIO_PLUGINS).plugins];

  const components: ComponentVersion[] = [];
  for (const pkg of packages) {
    try {
      const manifest = JSON.parse(await readFile(resolve(`${pkg}/package.json`), "utf8")) as {
        version?: string;
      };
      if (manifest.version) components.push({ package: pkg, version: manifest.version });
    } catch {
      // Not installed in this deployment — omit.
    }
  }

  const result: ComponentVersions = {
    assembly: {
      package: components.some((c) => c.package === "@cytario/web") ? "cytario-ee" : "@cytario/web",
      version: process.env.VERSION ?? "unknown",
    },
    components,
  };

  cache = result;
  return result;
}
