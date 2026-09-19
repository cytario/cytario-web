import type { TreeNode } from "./buildDirectoryTree";
import { isSidecarFilename } from "~/utils/sidecarKey";

/** Hidden from every view unless showHiddenFiles: dot-files and sidecar machinery. */
export function isHiddenFilename(name: string): boolean {
  return name.startsWith(".") || isSidecarFilename(name);
}

/** Applied at both scan time (filterObjects) and render time (DirectoryViewTree). */
export interface TreeFilters {
  showHiddenFiles?: boolean;
  extensions?: string[];
}

/** Shared by render and scan stages so both hide and admit the same set. */
export function namePassesFilters(
  name: string,
  isFile: boolean,
  filters: TreeFilters | undefined,
): boolean {
  if (!filters) return true;
  if (!filters.showHiddenFiles && isHiddenFilename(name)) return false;
  if (isFile && filters.extensions?.length) {
    const lower = name.toLowerCase();
    return filters.extensions.some((ext) => lower.endsWith(`.${ext.toLowerCase()}`));
  }
  return true;
}

export function nodePassesFilters(node: TreeNode, filters: TreeFilters | undefined): boolean {
  return namePassesFilters(node.name, node.type === "file", filters);
}
