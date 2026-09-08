/** Hard cap on total entries collected across paginated `ListObjectsV2` calls. */
export const DEFAULT_MAX_TOTAL = 10_000;

/** Hard cap on directories visited by one BFS scan (search / extension-filter walk). */
export const MAX_SEARCH_DIRS = 500;

/** How long a cached tree level stays fresh before the next load refetches. */
export const TREE_CACHE_TTL_MS = 5 * 60_000;

/** Shared truncation message so the cap value stays in sync with `DEFAULT_MAX_TOTAL`. */
export function formatTruncationMessage(name: string): string {
  return `Listing for "${name}" was truncated at the ${DEFAULT_MAX_TOTAL.toLocaleString()}-entry cap. Some entries are not shown.`;
}
