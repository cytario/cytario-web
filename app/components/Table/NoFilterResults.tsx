import { Button, EmptyState } from "@cytario/design";

import { useColumnFilters } from "./useColumnFilters";

/**
 * "No results match your filters" empty state with a "Clear all filters"
 * action. Shared by Table and DirectoryView when column filters exclude
 * every row.
 */
export function NoFilterResults({ tableId }: { tableId: string }) {
  const { resetFilters } = useColumnFilters({ tableId });

  return (
    <EmptyState
      icon="SearchX"
      title="No results"
      description="No results match your filters"
      action={
        <Button variant="secondary" iconLeft="FilterX" onPress={resetFilters}>
          Clear all filters
        </Button>
      }
    />
  );
}
