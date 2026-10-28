/**
 * Shared S3-host allowlist used by the CSP `connect-src` builder and the
 * connection schema / CORS preflight probe. `CYTARIO_ALLOWED_S3_HOSTS`
 * REPLACES the defaults entirely — deployers who want defaults plus extras
 * must include them explicitly.
 */

export const DEFAULT_S3_HOSTS = ["https://*.amazonaws.com", "https://*.cytario.com"];

// `process.env` as a default param crashes in the browser the moment zod
// invokes `isAllowedS3Host` from form validation.
const readProcessEnv = (): Record<string, string | undefined> => {
  if (typeof process !== "undefined" && process.env) return process.env;
  return {};
};

const isLocalEnv = (env: Record<string, string | undefined>): boolean =>
  env.NODE_ENV === "development" || env.NODE_ENV === "test";

/**
 * Accept `https://host[:port]` and `https://*.host[:port]`. Only a leading
 * `*.` wildcard label is allowed — embedded `*` would smuggle a permissive
 * pattern past validation. In local environments, `http://localhost[:port]`
 * and `http://127.0.0.1[:port]` are also accepted so test/dev object stores
 * work without TLS.
 */
const isWellFormedAllowlistEntry = (
  entry: string,
  env: Record<string, string | undefined> = readProcessEnv(),
): boolean => {
  const isLoopbackHttp =
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(entry) && isLocalEnv(env);
  if (!entry.startsWith("https://") && !isLoopbackHttp) return false;

  const rest = entry.slice(isLoopbackHttp ? "http://".length : "https://".length);
  if (rest.length === 0) return false;

  // URL parser balks on `*.` patterns, so split manually.
  if (/[/?#]/.test(rest)) return false;

  const [hostPart, portPart, ...extra] = rest.split(":");
  if (extra.length > 0) return false;
  if (portPart !== undefined && !/^\d+$/.test(portPart)) return false;

  if (hostPart.length === 0) return false;

  const labels = hostPart.split(".");
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (label.length === 0) return false;
    if (label === "*") {
      if (i !== 0) return false;
      continue;
    }
    if (!/^[a-zA-Z0-9-]+$/.test(label)) return false;
  }
  return true;
};

/**
 * Comma-separated `CYTARIO_ALLOWED_S3_HOSTS` overrides `DEFAULT_S3_HOSTS`
 * entirely. Malformed entries are dropped with a `console.warn`.
 */
export function getAllowedS3Hosts(
  env: Record<string, string | undefined> = readProcessEnv(),
): string[] {
  const raw = env.CYTARIO_ALLOWED_S3_HOSTS ?? "";
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [...DEFAULT_S3_HOSTS];
  }
  const overrides = trimmed
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((entry) => {
      if (isWellFormedAllowlistEntry(entry, env)) return true;
      console.warn(`[s3HostAllowlist] Ignoring malformed CYTARIO_ALLOWED_S3_HOSTS entry: ${entry}`);
      return false;
    });
  return overrides;
}

// `*.example.com` matches `foo.example.com` but not the bare parent, matching
// browser CORS / cookie rules.
const hostnameMatchesPattern = (hostname: string, patternHostname: string): boolean => {
  if (patternHostname.startsWith("*.")) {
    const suffix = patternHostname.slice(1);
    return hostname.endsWith(suffix) && hostname.length > suffix.length;
  }
  return hostname === patternHostname;
};

/**
 * https-only, except loopback http (`http://localhost` / `http://127.0.0.1`),
 * which is admitted only in local environments so dev/test object stores work
 * without TLS — loopback cannot be an SSRF oracle against anyone else's
 * network, and the surface stays otherwise https-only.
 */
export function isAllowedS3Host(
  url: string,
  env: Record<string, string | undefined> = readProcessEnv(),
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol === "http:") {
    return isLocalEnv(env) && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  }
  if (parsed.protocol !== "https:") return false;

  const allowed = getAllowedS3Hosts(env);
  for (const entry of allowed) {
    let pattern: URL;
    try {
      pattern = new URL(entry);
    } catch {
      continue;
    }
    if (pattern.protocol !== "https:") continue;
    // Pattern with no port matches any port; with a port, exact match required.
    if (pattern.port && pattern.port !== parsed.port) continue;
    if (hostnameMatchesPattern(parsed.hostname, pattern.hostname)) {
      return true;
    }
  }
  return false;
}
