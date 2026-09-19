import { NoFilterResults } from "@cytario/design";

import type { DirectoryKind } from "./DirectoryView";

/** Empty state for `nodes: []` — empty source or all rows filtered out. */
export function DirectoryViewEmptyState({ kind }: { kind: DirectoryKind }) {
  return <NoFilterResults tableId={kind} />;
}
