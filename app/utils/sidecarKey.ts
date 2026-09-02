import { getExtension } from "./fileType";

export type SidecarKind = "annotations" | "settings";

/**
 * Sidecar key for an image.
 *
 * **Annotations** are per-image: the image's extension is replaced with
 * `.annotations.<owner>.json`. For annotations `owner` is a **set id** (UUID);
 * for settings it is a **user id**.
 *
 * **Settings** are directory-level: the image filename is stripped and the
 * sidecar lives at `<dir>/.settings.<owner>.json`, so shared views are
 * visible across sibling images in the same directory.
 *
 * With `owner` omitted it defaults to the `*` wildcard, yielding a glob
 * that matches every owner's sidecar.
 *
 * Inputs are always clean `s3://bucket/key` image URIs (the viewer's current
 * image, built in `resolveResourceId`), so no query-string stripping or
 * image-type guard is needed.
 *
 * @example
 * getSidecarKey("s3://b/data/slide.ome.tif", "annotations", "set-uuid")
 * // "s3://b/data/slide.annotations.set-uuid.json"
 * getSidecarKey("s3://b/data/slide.ome.tif", "settings", "u1")
 * // "s3://b/data/settings.u1.json"
 * getSidecarKey("s3://b/data/slide.ome.tif", "settings")
 * // "s3://b/data/settings.*.json"  (all owners)
 */
export function getSidecarKey(imageKey: string, kind: SidecarKind, owner = "*"): string {
  if (kind === "settings") {
    const slashIdx = imageKey.lastIndexOf("/");
    if (slashIdx < 0) return `settings.${owner}.json`;
    return `${imageKey.slice(0, slashIdx)}/settings.${owner}.json`;
  }
  const ext = getExtension(imageKey);
  const base = ext ? imageKey.slice(0, -(ext.length + 1)) : imageKey;
  return `${base}.${kind}.${owner}.json`;
}

/**
 * Owner id from a sidecar filename produced by `getSidecarKey`. The
 * capture is greedy up to the final `.json`, so an owner id that itself contains
 * dots (e.g. a federated IdP subject) is still parsed, not dropped.
 *
 * Annotations keys are `<base>.<kind>.<owner>.json` (dot before kind);
 * settings keys are `<dir>/<kind>.<owner>.json` (slash before kind) or bare
 * `<kind>.<owner>.json`. The separator class `[/.]` covers all three.
 */
export function parseOwnerFromKey(filename: string, kind: SidecarKind): string | undefined {
  return filename.match(new RegExp(`(?:^|[/.])${kind}\\.(.+)\\.json$`))?.[1];
}
