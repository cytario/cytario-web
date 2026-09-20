// CYTARIO_LOCAL_PATHS maps package names to sibling checkouts for live
// development, e.g. {"@cytario/czi-loader":"/abs/czi-loader"}. Each entry is
// aliased to the sibling's src/index.ts so Vite serves its TypeScript source.
// Subpaths follow the sibling's own layout: "pkg/styles.css" maps to its built
// dist/index.css (tailwind output), everything else to src/.
//
// Bare react / react-aria imports inside sibling sources must not resolve
// via Node from the sibling's own node_modules or the workspace-root hoist —
// dedupe cannot reach SSR-externalized modules. Bundling the sibling AND its
// react-dependent runtime deps into SSR (ssrNoExternal) keeps those react
// imports inside Vite's resolver, where dedupe pins them to this app's
// install.

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const NPM_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface AliasEntry {
  readonly find: RegExp;
  readonly replacement: string;
}

export interface LocalDevelopmentConfig {
  readonly resolve: { alias: AliasEntry[]; dedupe: string[] } | undefined;
  readonly serverFsAllow: string[];
  readonly optimizeDepsExclude: string[];
  readonly ssrNoExternal: string[];
}

export function parseCytarioLocalPaths(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`CYTARIO_LOCAL_PATHS is not valid JSON: ${(error as Error).message}`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      "CYTARIO_LOCAL_PATHS must be a JSON object mapping package names to directories",
    );
  }
  const paths: Record<string, string> = {};
  for (const [packageName, directory] of Object.entries(parsed)) {
    if (!NPM_NAME_RE.test(packageName)) {
      throw new Error(
        `Invalid npm package name in CYTARIO_LOCAL_PATHS: ${JSON.stringify(packageName)}`,
      );
    }
    if (typeof directory !== "string" || directory === "") {
      throw new Error(`CYTARIO_LOCAL_PATHS[${packageName}] must be a non-empty directory string`);
    }
    paths[packageName] = resolve(directory);
  }
  return paths;
}

export function buildLocalDevelopmentConfig(
  localPaths: Record<string, string>,
): LocalDevelopmentConfig {
  const entries = Object.entries(localPaths);
  if (entries.length === 0) {
    return {
      resolve: undefined,
      serverFsAllow: [],
      optimizeDepsExclude: [],
      ssrNoExternal: [],
    };
  }
  const alias = entries.flatMap(([packageName, directory]) => {
    const escaped = escapeRegExp(packageName);
    return [
      // Exact specifier — the package's main entry, from source.
      { find: new RegExp(`^${escaped}$`), replacement: resolve(directory, "src/index.ts") },
      // The stylesheet export is tailwind output that only exists in dist.
      {
        find: new RegExp(`^${escaped}/styles\\.css$`),
        replacement: resolve(directory, "dist/index.css"),
      },
      // Every other subpath maps onto src/ (tokens, theme css, deep imports).
      { find: new RegExp(`^${escaped}/(.+)$`), replacement: `${resolve(directory, "src")}/$1` },
    ];
  });
  // Only sibling runtime deps that depend on react (lucide-react, zustand, …)
  // need bundling — that pulls them inside dedupe's reach. Everything else
  // stays SSR-externalized: Vite's dev SSR transform cannot execute CJS-only
  // packages (jpeg-js), Node's require can. An unreadable sibling package.json
  // (stale path, tests) degrades to [] — no bundling, old behavior.
  const reactImportingSiblingDeps = (directory: string): string[] => {
    try {
      const pkgJsonPath = resolve(directory, "package.json");
      const req = createRequire(pkgJsonPath);
      const dependencies = Object.keys(
        JSON.parse(readFileSync(pkgJsonPath, "utf8")).dependencies ?? {},
      );
      return dependencies.filter((dep) => {
        try {
          let dir = dirname(req.resolve(dep));
          for (;;) {
            const candidate = resolve(dir, "package.json");
            if (existsSync(candidate)) {
              const pkg = JSON.parse(readFileSync(candidate, "utf8"));
              return (
                "react" in
                {
                  ...pkg.dependencies,
                  ...pkg.peerDependencies,
                  ...pkg.optionalDependencies,
                }
              );
            }
            const parent = dirname(dir);
            if (parent === dir) return false;
            dir = parent;
          }
        } catch {
          return false;
        }
      });
    } catch {
      return [];
    }
  };

  return {
    resolve: {
      alias,
      dedupe: ["react", "react-dom", "react-aria-components", "@cytario/plugin-api"],
    },
    serverFsAllow: entries.map(([, directory]) => directory),
    optimizeDepsExclude: entries.map(([packageName]) => packageName),
    ssrNoExternal: [
      ...entries.map(([packageName]) => packageName),
      ...new Set(entries.flatMap(([, directory]) => reactImportingSiblingDeps(directory))),
    ],
  };
}
