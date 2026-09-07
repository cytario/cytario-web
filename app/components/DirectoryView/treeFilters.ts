import type { TreeNode } from "./buildDirectoryTree";
import { isHiddenFilename } from "./filterNodes";

/**
 * Declarative visibility filters for tree views — one object, one predicate,
 * applied at both scan time (S3 walk / filterObjects) and render time
 * (DirectoryViewTree). Add new filter dimensions here; ad-hoc one-off
 * predicates still use DirectoryViewTree's `nodeFilter` escape hatch.
 */
export interface TreeFilters {
  /** false/undefined hides dot-files and sidecar machinery files. */
  showHiddenFiles?: boolean;
  /** When set, files must end with one of these extensions (case-insensitive). Directories always pass. */
  extensions?: string[];
}

/**
 * Name-level predicate — shared by nodePassesFilters (render, TreeNode.name)
 * and filterObjects/bfsSearch (scan, key segments) so both stages hide and
 * admit the exact same set. `undefined` filters means raw — no filtering.
 */
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

/** Render-time predicate over TreeNodes. */
export function nodePassesFilters(node: TreeNode, filters: TreeFilters | undefined): boolean {
  return namePassesFilters(node.name, node.type === "file", filters);
}
