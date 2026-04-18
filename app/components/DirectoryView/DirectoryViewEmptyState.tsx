import { Button, EmptyState } from "@cytario/design";
import { FilterX, SearchX } from "lucide-react";

import type { DirectoryKind } from "./DirectoryView";
import { useColumnFilters } from "../Table/useColumnFilters";

/**
 * Empty state shared across DirectoryView's child views (Grid, Tree, Table*).
 * Rendered when the view receives `nodes: []` — either because the source is
 * empty or because column filters excluded everything. The FilterBar stays
 * visible above, giving the user agency to clear filters.
 */
export function DirectoryViewEmptyState({ kind }: { kind: DirectoryKind }) {
  const { resetFilters } = useColumnFilters({ tableId: kind });

  return (
    <EmptyState
      icon={SearchX}
      title="No results"
      description="No results match your filters"
      action={
        <Button variant="secondary" iconLeft={FilterX} onPress={resetFilters}>
          Clear all filters
        </Button>
      }
    />
  );
}
