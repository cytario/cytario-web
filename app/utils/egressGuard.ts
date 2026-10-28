/** SSRF guard for anonymous storage probes: host literals must be publicly
 * reachable (no private, loopback, link-local, or metadata host); DNS names
 * are admitted because no resolution happens on the validation path. */

const isPrivateIpv4 = (parts: number[]): boolean => {
  const [a, b] = parts;
  return (
    parts.some((n) => n > 255) ||
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
};

// Expand the compressed form to eight 16-bit groups, then check the private
// blocks AND the embedded-IPv4 spellings the URL parser keeps as hex
// (IPv4-mapped ::ffff:127.0.0.1 and IPv4-compatible ::10.0.0.1).
const isPrivateIpv6 = (host: string): boolean => {
  const sides = host.split("::");
  const head = sides[0] ? sides[0].split(":") : [];
  const tail = sides.length > 1 && sides[1] ? sides[1].split(":") : [];
  const groups: number[] = [
    ...head.map((g) => parseInt(g || "0", 16)),
    ...new Array(Math.max(0, 8 - head.length - tail.length)).fill(0),
    ...tail.map((g) => parseInt(g || "0", 16)),
  ].slice(0, 8);
  if (groups.length !== 8 || !groups.every((g) => Number.isInteger(g))) return true;

  const embeddedV4 =
    (groups[5] === 0xffff && groups.slice(0, 5).every((g) => g === 0)) ||
    groups.slice(0, 6).every((g) => g === 0);
  if (embeddedV4) {
    return (
      isPrivateIpv4([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]) ||
      groups[7] === 0
    );
  }

  const loopback = groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1;
  return (
    groups.every((g) => g === 0) ||
    loopback ||
    (groups[0] >= 0xfc00 && groups[0] <= 0xfdff) ||
    (groups[0] >= 0xfe80 && groups[0] <= 0xfebf)
  );
};

/** True when the URL's host is publicly reachable. */
export function isPubliclyReachableUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  // Node's URL parser normalizes integer/octal/hex IPv4 hosts
  // (https://2130706433 → 127.0.0.1), so the dotted checks cover those spellings.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return !isPrivateIpv4(host.split(".").map(Number));
  }
  if (host.includes(":")) {
    return !isPrivateIpv6(host);
  }
  // A DNS name is not resolvable here; literal hosts are gated above, names
  // are admitted.
  return true;
}

const isLoopbackHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
};

/** https on any host, or loopback http in a local env — loopback cannot be
 * an SSRF oracle against anyone else's network. */
export function isProbingAllowedEndpoint(
  url: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return isPubliclyReachableUrl(url);
  const isLocalEnv = env.NODE_ENV === "development" || env.NODE_ENV === "test";
  return parsed.protocol === "http:" && isLocalEnv && isLoopbackHost(parsed.hostname);
}
