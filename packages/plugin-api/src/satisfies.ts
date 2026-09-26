// Supports exact / caret / tilde, and `||` alternation of those (the form
// plugins already use in package.json). Rejects prereleases, "*", malformed
// input.
//
// Replaces the `semver` package to keep the bundle small and cut a ReDoS
// surface on plugin-supplied range strings. A single alternation split is
// linear: the per-alternative pattern is anchored and has no nested
// quantifiers, so there is no catastrophic backtracking.
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

function satisfiesSingle(range: string, version: Triple): boolean {
  const r = parse(range);
  if (!r) return false;
  const [rT, op] = r;
  if (op === "^") return version[0] === rT[0] && cmp(version, rT) >= 0;
  if (op === "~") return version[0] === rT[0] && version[1] === rT[1] && version[2] >= rT[2];
  return cmp(version, rT) === 0;
}

export function satisfies(range: string, version: string): boolean {
  const v = parse(version);
  if (!v) return false;
  // Reject if version string itself carries an operator.
  if (v[1] !== "") return false;
  const [vT] = v;
  // An empty alternative (`^6.0.0 ||`) parses to an empty string, which
  // fails to parse and so cannot admit a version by accident.
  return range.split("||").some((alternative) => satisfiesSingle(alternative, vT));
}
