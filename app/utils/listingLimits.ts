/** Hard cap on matched entries collected across paginated `ListObjectsV2` calls. */
export const DEFAULT_MAX_TOTAL = 10_000;

/** Hard cap on raw entries scanned across pages, regardless of `keyFilter` matches. */
export const DEFAULT_MAX_SCANNED = 100_000;

/** Shared truncation message so the cap value stays in sync with `DEFAULT_MAX_TOTAL`. */
export function formatTruncationMessage(name: string): string {
  return `Listing for "${name}" was truncated at the ${DEFAULT_MAX_TOTAL.toLocaleString()}-entry cap. Some entries are not shown.`;
}
