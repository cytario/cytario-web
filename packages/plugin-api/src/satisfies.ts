import semver from "semver";

/**
 * Whether a plugin's declared `apiVersion` range admits the host's contract
 * version. Delegates to npm's `semver`, so a plugin's range means here exactly
 * what it means in its `package.json`.
 *
 * A range that `semver` treats as "any version" is refused: an empty range, a
 * dangling `||` (`^6.0.0 ||`), or `*` all parse to `*`, which would let a
 * plugin that declared nothing usable load on a host it never targeted. This
 * gate fails closed — an unreadable range skips the plugin.
 */
export function satisfies(range: string, version: string): boolean {
  // `semver.validRange` normalises, so inspecting it catches both the empty
  // and the dangling-alternative shapes before they reach `satisfies`.
  if (semver.validRange(range) === "*") return false;
  return semver.satisfies(version, range);
}
