// Host-internal copy of the header sanitiser. Identical semantics to
// `sanitizeHeaders` exported from `@cytario/plugin-api`, but defined in
// the host bundle so the security validator is not reachable through
// the same module a plugin can import and (in bundled form) potentially
// monkey-patch. The public re-export from `@cytario/plugin-api` stays
// for plugin-author type ergonomics; the host never calls it.
//
// Rules — kept in lockstep with the public copy:
// - Allowlist names: Range, If-None-Match, Accept, Cache-Control.
// - Denylist names (always win): Authorization, Host, Cookie, x-amz-*.
// - Value must be a string of <= 1024 UTF-8 bytes.
// - Value must contain no ASCII control characters (U+0000..U+001F,
//   U+007F).
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
