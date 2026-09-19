import { getExtension } from "./fileType";

export type SidecarKind = "annotations" | "settings";

/**
 * Sidecar key for an image.
 *
 * **Annotations** are per-image: the image's extension is replaced with
 * `.annotations.<owner>.json`; `owner` is a **set id** (UUID).
 *
 * **Settings** are directory-level: the image filename is stripped and the
 * sidecar lives at `<dir>/.settings.<owner>.json` (owner is a **user id**),
 * so shared views are visible across sibling images in the same directory.
 *
 * With `owner` omitted it defaults to the `*` wildcard, yielding a glob
 * that matches every owner's sidecar. Inputs are always clean
 * `s3://bucket/key` image URIs, so no query-string stripping is needed.
 *
 * @example
 * getSidecarKey("s3://b/data/slide.ome.tif", "annotations", "set-uuid")
 * // "s3://b/data/slide.annotations.set-uuid.json"
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
 * Owner id from a sidecar filename produced by `getSidecarKey`. The capture
 * is greedy up to the final `.json`, so an owner id that itself contains dots
 * (e.g. a federated IdP subject) is still parsed. The separator class `[/.]`
 * covers annotations keys (dot before kind), settings keys with a directory
 * (slash before kind), and bare settings keys.
 */
export function parseOwnerFromKey(filename: string, kind: SidecarKind): string | undefined {
  return filename.match(new RegExp(`(?:^|[/.])${kind}\\.(.+)\\.json$`))?.[1];
}

/** Filename is an annotation or settings sidecar — machinery, hidden from every
 *  directory view. Reuses the `parseOwnerFromKey` grammar so the two can't
 *  drift; a user file that happens to match is hidden too (same accepted
 *  exposure as the wildcard read). */
export function isSidecarFilename(name: string): boolean {
  return (
    parseOwnerFromKey(name, "annotations") !== undefined ||
    parseOwnerFromKey(name, "settings") !== undefined
  );
}
