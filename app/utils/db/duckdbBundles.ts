// Bundled locally rather than fetched from cdn.jsdelivr.net so we do not leak
// every user's IP to a third-party CDN (also blocked by CSP).
import type { DuckDBBundles } from "@duckdb/duckdb-wasm";
import duckdbCoiPthreadWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-coi.pthread.worker.js?url";
import duckdbCoiWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-coi.worker.js?url";
import duckdbEhWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import duckdbMvpWorker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdbCoiModule from "@duckdb/duckdb-wasm/dist/duckdb-coi.wasm?url";
import duckdbEhModule from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdbMvpModule from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";

/**
 * Resolve a Vite-emitted URL to an absolute URL. DuckDB's worker runs in a
 * `blob:` origin where `new Request("/...")` throws — we must pre-resolve.
 */
function absoluteUrl(path: string): string {
  if (typeof window === "undefined") {
    throw new Error(
      "getLocalDuckDbBundles() must not be called during SSR — DuckDB-WASM is a browser-only module.",
    );
  }
  return new URL(path, window.location.origin).href;
}

/** Drop-in replacement for `getJsDelivrBundles()` pointing at the local assets. */
export function getLocalDuckDbBundles(): DuckDBBundles {
  return {
    mvp: {
      mainModule: absoluteUrl(duckdbMvpModule),
      mainWorker: absoluteUrl(duckdbMvpWorker),
    },
    eh: {
      mainModule: absoluteUrl(duckdbEhModule),
      mainWorker: absoluteUrl(duckdbEhWorker),
    },
    coi: {
      mainModule: absoluteUrl(duckdbCoiModule),
      mainWorker: absoluteUrl(duckdbCoiWorker),
      pthreadWorker: absoluteUrl(duckdbCoiPthreadWorker),
    },
  };
}
