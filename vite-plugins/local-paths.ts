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
  /** Scanner entry files: the excluded deps' own dist entries. */
  readonly optimizeDepsEntries: string[];
  readonly ssrNoExternal: string[];
}

/**
 * Scanner entry files for a locally-aliased package's devNoOptimize deps:
 * each excluded dependency's resolved entry, from the aliased package's own
 * node_modules resolution.
 *
 * An `optimizeDeps.exclude`d dependency is treated as external by Vite's dep
 * scanner — its imports are NOT walked. When the package later loads as
 * native ESM (that is the point of excluding it) and imports a bare dep the
 * scanner never saw, that dep is discovered at REQUEST time: optimization
 * re-runs mid-session, every `?v=` hash already issued goes stale, and
 * dynamic imports die with `error loading dynamically imported module`
 * (seen with deck.gl → @probe.gl/stats under the spatialdata-viewer alias).
 *
 * Feeding the excluded packages' entry files back to the scanner as ENTRIES
 * restores the walk: their runtime graph (resolved from THEIR node_modules,
 * exactly where the browser will load it) is pre-bundled on the first
 * optimization run, so hashes are stable from the first request. The excluded
 * packages themselves still load raw — exclusion is not affected by scanning.
 */
const noOptimizeScanEntries = (directory: string): string[] => {
  try {
    const req = createRequire(resolve(directory, "package.json"));
    return devNoOptimizeDeps(directory).flatMap((dep) => {
      try {
        return [req.resolve(dep)];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
};

/**
 * Deps of a locally-aliased package that ship dist-relative asset URLs
 * (workers, wasm binaries) referenced via `new URL(..., import.meta.url)`.
 *
 * Pre-bundling such a package into node_modules/.vite/deps RELOCATES its
 * modules, so every dist-relative URL it computes at runtime points at files
 * that no longer exist there — the optimizer rewrites the import graph but
 * cannot rewrite URL strings built at runtime. The worker then loads the SPA
 * fallback (HTML, empty MIME) and the whole decode pool dies with
 * NS_ERROR_CORRUPTED_CONTENT. Excluded deps are served as native ESM straight
 * from node_modules, where their relative URLs resolve.
 *
 * A package opts in by declaring the list in its package.json under
 * `cytario.devNoOptimize` — the package knows its own graph; the host does
 * not guess. Unreadable package.json degrades to [] (old behavior).
 *
 * Exit path: this works around upstream workers whose URL is not injectable
 * (zarrextra's codec worker). Once upstream threads a `workerUrl` option
 * through `EnsureCodecWorkersOptions` → `enableWorkerChunkDecode`, the
 * plugin can hand every worker an explicitly-resolved URL and this
 * declaration — and the scanner-entry companion in vite.config.ts — can be
 * deleted.
 */
const devNoOptimizeDeps = (directory: string): string[] => {
  try {
    const pkg = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8"));
    const list = pkg?.cytario?.devNoOptimize;
    if (!Array.isArray(list)) return [];
    return list.filter((dep: unknown): dep is string => typeof dep === "string");
  } catch {
    return [];
  }
};

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

/**
 * Runtime dependencies a locally-aliased package declares as SHARED with
 * the app: `cytario.devSharedDeps` in its package.json (e.g. deck.gl and
 * luma.gl for spatialdata-viewer).
 *
 * A package that bundles its whole graph into dist does so to keep ONE copy
 * of each runtime on the page — under src aliasing its graph resolves from
 * its own node_modules as SECOND copies alongside the app's. For stateless
 * libs a duplicate is wasteful but harmless; for singletons it is fatal:
 * deck.gl's ShaderAssembler getDefaultShaderAssembler() is a static field
 * per module copy, and its init guards on a global version string, so two
 * copies break shader-hook registration (DECKGL_FILTER_COLOR: no matching
 * overloaded function) or throw on version mismatch.
 *
 * Each declared dep is aliased to a single resolution — the app's copy when
 * the app installs it (the common case for deck/luma, which the app itself
 * uses), else the aliased package's own (pure re-export barrels like the
 * deck.gl meta package, which the app does not install). Either way every
 * specifier on the page resolves to the SAME instance: subpath packages
 * from the app, barrels from the sibling — a barrel only re-exports, so
 * the underlying singletons stay shared. Subpaths of a shared dep map onto
 * the same resolution's subpaths. Unreadable package.json degrades to no
 * shared deps (old behavior).
 */
const sharedRuntimeDeps = (directory: string): string[] => {
  try {
    const list = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8"))?.cytario
      ?.devSharedDeps;
    if (!Array.isArray(list)) return [];
    return list.filter((dep: unknown): dep is string => typeof dep === "string");
  } catch {
    return [];
  }
};

/**
 * Resolve one shared dep to its package root: prefer the app's install,
 * fall back to the sibling's own copy. Resolves the package ENTRY (many
 * packages do not export ./package.json) and walks up to the nearest
 * package.json — the package root for normal installs.
 */
const resolveSharedDep = (appRequire: NodeRequire, directory: string, dep: string): string | null => {
  const rootOf = (entryPath: string): string | null => {
    let dir = dirname(entryPath);
    for (;;) {
      const candidate = resolve(dir, "package.json");
      if (existsSync(candidate)) {
        try {
          if (JSON.parse(readFileSync(candidate, "utf8"))?.name === dep) return dir;
        } catch {
          /* unreadable — keep walking */
        }
      }
      const parent = dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  };
  try {
    return rootOf(appRequire.resolve(dep));
  } catch {
    try {
      return rootOf(createRequire(resolve(directory, "package.json")).resolve(dep));
    } catch {
      return null;
    }
  }
};

export function buildLocalDevelopmentConfig(
  localPaths: Record<string, string>,
): LocalDevelopmentConfig {
  const entries = Object.entries(localPaths);
  if (entries.length === 0) {
    return {
      resolve: undefined,
      serverFsAllow: [],
      optimizeDepsExclude: [],
      optimizeDepsEntries: [],
      ssrNoExternal: [],
    };
  }
  // Shared runtimes: one alias per (dep, resolution) across all local
  // packages — the same dep from two packages maps to the same copy.
  const appRequire = createRequire(process.cwd() + "/package.json");
  const sharedAliases = new Map<string, string>();
  const sharedFsAllow: string[] = [];
  for (const [, directory] of entries) {
    for (const dep of sharedRuntimeDeps(directory)) {
      if (sharedAliases.has(dep)) continue;
      const resolved = resolveSharedDep(appRequire, directory, dep);
      if (!resolved) continue;
      sharedAliases.set(dep, resolved);
      sharedFsAllow.push(resolved);
    }
  }
  const alias = [
    ...entries.flatMap(([packageName, directory]) => {
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
    }),
    ...[...sharedAliases.entries()].flatMap(([dep, resolved]) => {
      const escaped = escapeRegExp(dep);
      return [
        { find: new RegExp(`^${escaped}$`), replacement: resolve(resolved, "dist/index.js") },
        // Subpath specifiers of the shared dep map onto the same copy.
        {
          find: new RegExp(`^${escaped}/(.+)$`),
          replacement: `${resolve(resolved, "dist")}/$1`,
        },
      ];
    }),
  ];
  // Only sibling runtime deps that depend on react (lucide-react, zustand, …)
  // need bundling — that pulls them inside dedupe's reach. Everything else
  // stays SSR-externalized: Vite's dev SSR transform cannot execute CJS-only
  // packages (jpeg-js), Node's require can. An unreadable sibling package.json
  // (stale path, tests) degrades to [] — no bundling, old behavior.
  //
  // Peer (and optional) deps count too: @cytario/design declares its
  // react-importing runtime deps (react-aria-components, @tanstack/react-table)
  // as peers, so scanning only `dependencies` left them SSR-externalized and
  // resolving react from the sibling's own node_modules — a second react
  // instance that crashes SSR. react/react-dom themselves stay external: they
  // are the singletons dedupe pins, not packages to bundle.
  const reactImportingSiblingDeps = (directory: string): string[] => {
    try {
      const pkgJsonPath = resolve(directory, "package.json");
      const req = createRequire(pkgJsonPath);
      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
      const dependencies = Object.keys({
        ...pkg.dependencies,
        ...pkg.peerDependencies,
        ...pkg.optionalDependencies,
      }).filter((dep) => dep !== "react" && dep !== "react-dom");
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
      dedupe: [
        "react",
        "react-dom",
        "react-aria-components",
        "@cytario/plugin-api",
        ...[...sharedAliases.keys()],
      ],
    },
    serverFsAllow: [...entries.map(([, directory]) => directory), ...sharedFsAllow],
    optimizeDepsExclude: [
      ...entries.map(([packageName]) => packageName),
      ...new Set(entries.flatMap(([, directory]) => devNoOptimizeDeps(directory))),
    ],
    optimizeDepsEntries: entries.flatMap(([, directory]) => noOptimizeScanEntries(directory)),
    ssrNoExternal: [
      ...entries.map(([packageName]) => packageName),
      ...new Set(entries.flatMap(([, directory]) => reactImportingSiblingDeps(directory))),
    ],
  };
}
