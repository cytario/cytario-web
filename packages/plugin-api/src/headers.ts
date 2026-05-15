// Allowlist: Range, If-None-Match, Accept, Cache-Control.
// Denylist (always wins): Authorization, Host, Cookie, x-amz-*.
// Value guards: UTF-8 byte length <= 1024; no ASCII control characters
// (U+0000..U+001F, U+007F). These two rules close header-smuggling and
// resource-exhaustion vectors that the name-only allowlist alone misses.
// First line of defense; the caller's merge order (signed headers last)
// is the second.
const ALLOWED = new Set(["range", "if-none-match", "accept", "cache-control"]);
const DENIED_EXACT = new Set(["authorization", "host", "cookie"]);
const DENIED_PREFIX = "x-amz-";
const MAX_VALUE_BYTES = 1024;
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR = /[\x00-\x1F\x7F]/;
const utf8 = new TextEncoder();

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
    if (typeof value !== "string") continue;
    if (CONTROL_CHAR.test(value)) continue;
    if (utf8.encode(value).length > MAX_VALUE_BYTES) continue;
    out[rawKey] = value;
  }
  return out;
}
