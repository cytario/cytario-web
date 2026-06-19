import { getExtension, isImageFile, stripUrlSuffix } from "./fileType";

export type SidecarKind = "annotations" | "settings";

/**
 * Strips the matched image extension from an image key/URI, yielding the base
 * used for sidecar filenames. Returns `null` for non-image keys.
 *
 * @example
 * getSidecarBase("data/slide.ome.tif")              // "data/slide"
 * getSidecarBase("s3://b/data/slide.ome.tif")       // "s3://b/data/slide"
 * getSidecarBase("data/slide.png")                  // "data/slide"
 * getSidecarBase("data/notes.txt")                  // null
 */
function getSidecarBase(imageKey: string): string | null {
  const key = stripUrlSuffix(imageKey);
  if (!isImageFile(key)) return null;
  const ext = getExtension(key);
  if (!ext) return null;
  return key.slice(0, -(ext.length + 1));
}

/**
 * Exact sidecar key for a single user — used for writes and own-reads.
 *
 * @example
 * getSidecarKey("data/slide.ome.tif", { kind: "annotations", userId: "u1" })
 * // "data/slide.annotations.u1.json"
 */
export function getSidecarKey(
  imageKey: string,
  { kind, userId }: { kind: SidecarKind; userId: string },
): string | null {
  const base = getSidecarBase(imageKey);
  return base === null ? null : `${base}.${kind}.${userId}.json`;
}

/**
 * Glob pattern matching every user's sidecar of a kind — used for the
 * cross-user read union via duckdb.
 *
 * @example
 * getSidecarGlob("data/slide.ome.tif", { kind: "annotations" })
 * // "data/slide.annotations.*.json"
 */
export function getSidecarGlob(imageKey: string, { kind }: { kind: SidecarKind }): string | null {
  const base = getSidecarBase(imageKey);
  return base === null ? null : `${base}.${kind}.*.json`;
}
