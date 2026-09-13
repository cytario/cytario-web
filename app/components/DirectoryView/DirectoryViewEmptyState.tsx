import { NoFilterResults } from "@cytario/design";

import type { DirectoryKind } from "./DirectoryView";

/**
 * Empty state shared across DirectoryView's child views (Grid, Tree, Table*).
 * Rendered when the view receives `nodes: []` — either because the source is
 * empty or because column filters excluded everything.
 */
export function DirectoryViewEmptyState({ kind }: { kind: DirectoryKind }) {
  return <NoFilterResults tableId={kind} />;
}
