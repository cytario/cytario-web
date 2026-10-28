/** Build the CSP header; the connect-src hosts are resolved per request by
 * `cspConnectSrc.server.ts`, every other directive is static. */
export function buildContentSecurityPolicy(
  env: Record<string, string | undefined> = process.env,
  connectSrcHosts: string[] = [],
): string {
  const isLocalEnv = env.NODE_ENV === "development" || env.NODE_ENV === "test";

  const connectSrc = [
    "'self'",
    ...connectSrcHosts,
    // Dev-only carve-out so a local object store / OCI registry is reachable
    // during development; never applied outside local envs.
    ...(isLocalEnv
      ? (env.CYTARIO_DEV_CONNECT_HOSTS?.split(",")
          .map((s) => s.trim())
          .filter(Boolean) ?? [])
      : []),
  ].join(" ");

  const directives: Record<string, string> = {
    "default-src": "'self'",
    "connect-src": connectSrc,
    // `'unsafe-inline'`: React Router's streamed hydration bootstrap.
    // `'unsafe-eval'`: numcodecs' emscripten dyncall trampolines (Zarr v2
    // blosc / lz4 / zstd). `'wasm-unsafe-eval'`: DuckDB WASM.
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
