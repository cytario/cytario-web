import type { _Object } from "@aws-sdk/client-s3";

/**
 * Per-object predicate used when listing S3 for the connection index.
 * Excludes:
 * - Contents of any `.cytario/` directory (the index parquet lives there).
 * - All but the first object encountered under each `*.zarr/` root — the
 *   directory tree collapses zarrs into a single leaf anyway.
 *
 * The caller owns `seenZarrRoots` so it persists across pagination boundaries
 * within one listing pass.
 */
export function connectionIndexFilter(
  obj: _Object,
  seenZarrRoots: Set<string>,
): boolean {
  if (isInCytarioDir(obj.Key)) return false;
  const zarrRoot = extractZarrRoot(obj.Key);
  if (zarrRoot) {
    if (seenZarrRoots.has(zarrRoot)) return false;
    seenZarrRoots.add(zarrRoot);
  }
  return true;
}

/**
 * If `key` lies inside a `*.zarr/` directory, return the zarr root (path up to
 * and including the `.zarr/` segment). Otherwise returns `undefined`.
 */
function extractZarrRoot(key: string | undefined): string | undefined {
  if (!key) return undefined;
  const match = key.match(/^(.*?\.zarr\/)/i);
  return match?.[1];
}

/** Returns true if `key` points into a `.cytario/` directory at any depth. */
function isInCytarioDir(key: string | undefined): boolean {
  if (!key) return false;
  return /(^|\/)\.cytario\//.test(key);
}
