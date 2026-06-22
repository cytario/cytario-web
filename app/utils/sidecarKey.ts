import { getExtension } from "./fileType";

export type SidecarKind = "annotations" | "settings";

/**
 * Sidecar key for an image — the image's extension replaced with
 * `.<kind>.<userId>.json`. With `userId` omitted it defaults to the `*`
 * wildcard, yielding a glob that matches every user's sidecar.
 *
 * Inputs are always clean `s3://bucket/key` image URIs (the viewer's current
 * image, built in `resolveResourceId`), so no query-string stripping or
 * image-type guard is needed.
 *
 * @example
 * getSidecarKey("s3://b/data/slide.ome.tif", "annotations", "u1")
 * // "s3://b/data/slide.annotations.u1.json"
 * getSidecarKey("s3://b/data/slide.ome.tif", "annotations")
 * // "s3://b/data/slide.annotations.*.json"  (all users)
 */
export function getSidecarKey(imageKey: string, kind: SidecarKind, userId = "*"): string {
  const ext = getExtension(imageKey);
  const base = ext ? imageKey.slice(0, -(ext.length + 1)) : imageKey;
  return `${base}.${kind}.${userId}.json`;
}
