import { getFileTypeEntry, stripUrlSuffix } from "./fileType";

/** The whole S3 prefix is one logical image (`.zarr`, `.vsi`). */
export function isLeafDirectory(name: string): boolean {
  return getFileTypeEntry(name)?.storageLayout === "leaf";
}

/** Any segment of `path` is a leaf directory (covers interior deep links). */
export function isLeafDirectoryPath(path: string): boolean {
  return path.split("/").some((segment) => segment !== "" && isLeafDirectory(segment));
}

/** `key` is an interior object of a leaf directory (`a.zarr/0/0`). */
export function isInsideLeafDirectory(key: string): boolean {
  const segments = key.replace(/\/$/, "").split("/");
  return segments.slice(0, -1).some((segment) => segment !== "" && isLeafDirectory(segment));
}

/** `name` is a file whose payload lives in a same-named sibling directory. */
export function hasCompanionDirectory(name: string): boolean {
  return getFileTypeEntry(name)?.storageLayout === "companion";
}

/**
 * Directory prefixes to hide: `slide.mrxs` ⇒ `slide/`, `OS-1.vsi` ⇒
 * `_OS-1_/` (per the format's `companionDir` template). Match via startsWith.
 */
export function companionDirectoryPrefixes(keys: readonly string[]): Set<string> {
  const hidden = new Set<string>();
  for (const key of keys) {
    const entry = getFileTypeEntry(key);
    if (entry?.storageLayout !== "companion") continue;
    const path = stripUrlSuffix(key);
    const dot = path.lastIndexOf(".");
    const slash = path.lastIndexOf("/");
    if (dot <= slash) continue;
    const stem = path.slice(slash + 1, dot);
    if (!stem) continue;
    const dir = entry.companionDir === "underscore-wrapped" ? `_${stem}_` : stem;
    hidden.add(`${path.slice(0, slash + 1)}${dir}/`);
  }
  return hidden;
}

/** True when `key` lives under any of the hidden prefixes. */
export function isInsideHiddenPrefix(key: string, hidden: Set<string>): boolean {
  for (const prefix of hidden) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}
