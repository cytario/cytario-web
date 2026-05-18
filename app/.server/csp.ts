import { getAllowedS3Hosts } from "~/utils/s3HostAllowlist";

export { getAllowedS3Hosts };

/** Build the CSP header value. Callers feed the env so tests can override it. */
export function buildContentSecurityPolicy(
  env: Record<string, string | undefined> = process.env,
): string {
  const connectSrc = ["'self'", ...getAllowedS3Hosts(env)].join(" ");

  const directives: Record<string, string> = {
    "default-src": "'self'",
    "connect-src": connectSrc,
    // `'unsafe-inline'` is required by React Router's streamed hydration
    // bootstrap script. `'unsafe-eval'` is required by numcodecs' emscripten
    // dyncall trampolines (Zarr v2 blosc / lz4 / zstd). `'wasm-unsafe-eval'`
    // covers DuckDB WASM. TODO: drop `'unsafe-eval'` once codecs go CSP-clean.
    "script-src": "'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
    "style-src": "'self' 'unsafe-inline'",
    "img-src": "'self' data: blob:",
    "font-src": "'self' data:",
    // DuckDB WASM spawns its main worker from a same-origin asset and uses
    // `blob:` URLs internally for in-worker file buffers.
    "worker-src": "'self' blob:",
    "base-uri": "'self'",
    "form-action": "'self'",
    "object-src": "'none'",
    "frame-ancestors": "'none'",
  };

  return Object.entries(directives)
    .map(([directive, value]) => `${directive} ${value}`)
    .join("; ");
}
