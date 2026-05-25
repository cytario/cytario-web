/**
 * Compare two slash-delimited group paths segment by segment so that
 * siblings sort alphabetically and a parent always precedes its children.
 */
export function compareGroupPaths(a: string, b: string): number {
  const as = a.split("/");
  const bs = b.split("/");
  const n = Math.min(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    const cmp = as[i].localeCompare(bs[i]);
    if (cmp !== 0) return cmp;
  }
  return as.length - bs.length;
}
