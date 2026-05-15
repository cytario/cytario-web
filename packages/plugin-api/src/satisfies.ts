// Supports exact / caret / tilde. Rejects prereleases, "*", malformed input.
// Replaces the `semver` package to keep the bundle small and cut a ReDoS
// surface on plugin-supplied range strings.
const RE = /^\s*([\^~]?)(\d+)\.(\d+)\.(\d+)\s*$/;

function parse(s: string): [Triple, "" | "^" | "~"] | null {
  const m = RE.exec(s);
  if (!m) return null;
  const op = m[1] as "" | "^" | "~";
  return [[Number(m[2]), Number(m[3]), Number(m[4])], op];
}

type Triple = [number, number, number];

function cmp(a: Triple, b: Triple): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

export function satisfies(range: string, version: string): boolean {
  const r = parse(range);
  const v = parse(version);
  if (!r || !v) return false;
  // Reject if version string itself carries an operator.
  if (v[1] !== "") return false;
  const [rT, op] = r;
  const [vT] = v;
  if (op === "^") return vT[0] === rT[0] && cmp(vT, rT) >= 0;
  if (op === "~") return vT[0] === rT[0] && vT[1] === rT[1] && vT[2] >= rT[2];
  return cmp(vT, rT) === 0;
}
