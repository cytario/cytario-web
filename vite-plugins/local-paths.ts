// CYTARIO_LOCAL_PATHS maps package names to sibling checkouts for live
// development, e.g. {"@cytario/czi-loader":"/abs/czi-loader"}. Each entry is
// aliased to the sibling's src/index.ts so Vite serves its TypeScript source.
// Subpaths follow the sibling's own layout: "pkg/styles.css" maps to its built
// dist/index.css (tailwind output), everything else to src/.
//
// Bare react / react-aria imports inside sibling sources resolve from the
// sibling's own node_modules or the workspace-root hoist, creating duplicate
// module instances — dedupe pins them to this app's install.
//
// That covers the client pipeline only. In SSR a sibling that is externalized
// is imported by Node from its real path, so its own node_modules wins for
// every bare specifier inside it — React included, leaving the server render
// with a second copy and a null dispatcher on the first useContext. Bundling
// the sibling (and the dependency tree it brings) into the SSR output instead
// lets those imports resolve through this app's install.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const NPM_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

// Packages whose bare imports must resolve from this app rather than from the
// sibling's own install: the React-family singletons, plus the plugin API.
const SHARED_RUNTIME_DEDUPE = [
  "react",
  "react-dom",
  "react-aria-components",
  "@cytario/plugin-api",
];

// Siblings that only supply components/utilities to this app and consume the
// React runtime as a peer dependency — safe, and necessary, to bundle into the
// SSR output so they share this app's React. Package names only: a plugin runs
// standalone and carries its own React peer, so it must keep resolving from its
// own install. CYTARIO_LOCAL_PATHS never contains @cytario/plugin-api anyway —
// that one resolves through @cytario/web's own workspace copy.
const SSR_BUNDLED_SIBLINGS = ["@cytario/design"];

// A bundled sibling brings its own dependency tree, and those dependencies also
// reach React through their own node_modules. Read the list off the sibling's
// package.json rather than hardcoding it, so it cannot drift.
function siblingRuntimeDeps(directory: string): string[] {
  try {
    const pkg = JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8"));
    return Object.keys(pkg.dependencies ?? {});
  } catch {
    return [];
  }
}

export function ssrBundledPackages(localPaths: Record<string, string>): string[] {
  const bundled = Object.entries(localPaths).filter(([name]) =>
    SSR_BUNDLED_SIBLINGS.includes(name),
  );
  return bundled.flatMap(([name, directory]) => [name, ...siblingRuntimeDeps(directory)]);
}

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
  return {
    resolve: {
      alias,
      dedupe: SHARED_RUNTIME_DEDUPE,
    },
    serverFsAllow: entries.map(([, directory]) => directory),
    optimizeDepsExclude: entries.map(([packageName]) => packageName),
    // Only the React-consuming siblings (plus their dependency trees) are
    // bundled; the plugins stay external, as they run standalone.
    ssrNoExternal: ssrBundledPackages(localPaths),
  };
}
