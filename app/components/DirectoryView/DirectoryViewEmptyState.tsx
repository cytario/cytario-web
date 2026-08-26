import type { DirectoryKind } from "./DirectoryView";
import { NoFilterResults } from "../Table/NoFilterResults";

/**
 * Empty state shared across DirectoryView's child views (Grid, Tree, Table*).
 * Rendered when the view receives `nodes: []` — either because the source is
 * empty or because column filters excluded everything. The FilterBar stays
 * visible above, giving the user agency to clear filters.
 */
export function DirectoryViewEmptyState({ kind }: { kind: DirectoryKind }) {
  return <NoFilterResults tableId={kind} />;
}
