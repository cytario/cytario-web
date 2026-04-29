import type { _Object } from "@aws-sdk/client-s3";

/**
 * Builds a per-object predicate for the connection-index listing pass.
 * Keeps only the first object encountered under each `*.zarr/` root — the
 * directory tree collapses zarrs into a single leaf anyway. The closure
 * holds the seen-roots set so the same predicate can be threaded through
 * multiple paginated `ListObjectsV2` responses.
 *
 * Hidden files (including the `.cytario/` directory itself) are kept;
 * visibility is a UI concern, not an indexing one.
 */
export function createConnectionIndexFilter(): (obj: _Object) => boolean {
  const seenZarrRoots = new Set<string>();

  return (obj) => {
    const zarrRoot = obj.Key?.match(/^(.*?\.zarr\/)/i)?.[1];
    if (zarrRoot) {
      if (seenZarrRoots.has(zarrRoot)) return false;
      seenZarrRoots.add(zarrRoot);
    }
    return true;
  };
}
