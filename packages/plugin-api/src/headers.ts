// Allowlist: Range, If-None-Match, Accept, Cache-Control.
// Denylist (always wins): Authorization, Host, Cookie, x-amz-*.
// First line of defense; the caller's merge order (signed headers last) is
// the second.
const ALLOWED = new Set(["range", "if-none-match", "accept", "cache-control"]);
const DENIED_EXACT = new Set(["authorization", "host", "cookie"]);
const DENIED_PREFIX = "x-amz-";

export function sanitizeHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  if (!headers) return {};
  const out: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    if (DENIED_EXACT.has(key)) continue;
    if (key.startsWith(DENIED_PREFIX)) continue;
    if (!ALLOWED.has(key)) continue;
    out[rawKey] = value;
  }
  return out;
}
