/**
 * ITables offline-init support for the sandboxed report frame (C-731).
 *
 * itables 2.x's `init_notebook_mode` cell (offline mode, as delivered in
 * Quarto reports) decodes its base64 DataTables bundle into a `Blob`, turns
 * it into a `blob:null/…` URL, and dynamic-`import()`s it. Inside the
 * report frame that import can never succeed: the inherited CSP's
 * script-src has no `blob:`, and the frame's opaque origin fails the
 * module fetch outright — so every ITables table keeps its "Loading
 * ITables…" fallback banner while plotly figures (classic inline scripts)
 * work fine.
 *
 * The bundle itself is a self-contained ES module: no imports, no
 * `import.meta` — only a final `export{…}` statement. So the loader
 * pre-resolves the itables version promise with a frame-side classic
 * script that evaluates the same bundle with the export statement
 * rewritten into an exports-object assignment. The init script's
 * `if (!window._itables_<version>)` guard then skips the broken import
 * path entirely.
 */

const ISTALLS_INIT_PATTERN =
  /window\._itables_([\d_]+)\s*=\s*injectModule\(\s*(["'])([A-Za-z0-9+/=]+)\2\s*\)/;

/**
 * Match an itables offline-init inline script; returns the underscore
 * version and the base64 bundle payload. Only the shape itables 2.x
 * actually emits is accepted — the `window._itables_<version> =
 * injectModule("<base64>")` assignment with a plain literal argument.
 */
export function detectItablesInit(
  scriptText: string,
): { version: string; bundleBase64: string } | null {
  const match = ISTALLS_INIT_PATTERN.exec(scriptText);
  if (match === null) return null;
  return { version: match[1]!, bundleBase64: match[3]! };
}

/**
 * Rewrite a base64-decoded ES-module bundle into a classic script that
 * defines `window.__itables_module` with the module's exports. Only the
 * itables bundle shape is supported: a single trailing
 * `export{local as Name, …}` statement and no other module syntax.
 */
export function classicModuleScript(bundleSource: string): string | null {
  const exportMatch = /\bexport\s*\{([^}]+)\}\s*;?\s*$/.exec(bundleSource);
  if (exportMatch === null) return null;
  const names: Array<[local: string, exported: string]> = [];
  for (const part of exportMatch[1]!.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;
    const asMatch = /^([\w$]+)\s+as\s+([\w$]+)$/.exec(trimmed);
    if (asMatch !== null) {
      names.push([asMatch[1]!, asMatch[2]!]);
      continue;
    }
    if (!/^[\w$]+$/.test(trimmed)) return null;
    names.push([trimmed, trimmed]);
  }
  if (names.length === 0) return null;
  const body = bundleSource.slice(0, exportMatch.index);
  // Any import syntax (static `import x from`, bare `import "…"`, dynamic
  // `import(`) or `import.meta` needs a module context the classic eval
  // cannot provide — such bundles are left to the broken path rather than
  // half-evaluated.
  if (/(^|[\s;})])import\b/.test(body) || /\bimport\.meta\b/.test(body)) return null;
  const exports = names.map(([local, exported]) => `${exported}: ${local}`).join(", ");
  return `${body}\nwindow.__itables_module = {${exports}};\n`;
}

/**
 * The classic script injected ahead of the report's init cell: evaluates
 * the transformed bundle, resolves the itables version promise with its
 * exports, and fires the ready event the report's table scripts wait on.
 * The itables-underscored version becomes the dotted event name
 * (`_2_9_1` → `2.9.1`), matching `itables' _itables_ready_event()`.
 */
export function buildItablesPreshim(classicBundle: string, underscoreVersion: string): string {
  return `${classicBundle}
window._itables_${underscoreVersion} = Promise.resolve(window.__itables_module);
window.dispatchEvent(new Event("itables-${underscoreVersion.replace(/_/g, ".")}-ready"));`;
}
