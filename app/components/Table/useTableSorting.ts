import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { useCallback } from "react";

import { useDirectoryStore } from "../DirectoryView/useDirectoryStore";

export function useTableSorting(tableId: string) {
  const { tableSorting, setTableSorting } = useDirectoryStore();

  // Get sorting directly from store (source of truth)
  const sorting = tableSorting[tableId] ?? [];

  // Update store when sorting changes
  const setSorting: OnChangeFn<SortingState> = useCallback(
    (updaterOrValue) => {
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(tableSorting[tableId] ?? [])
          : updaterOrValue;
      setTableSorting(tableId, next);
    },
    [tableId, tableSorting, setTableSorting],
  );

  // Reset sorting to default (empty)
  const resetSorting = useCallback(() => {
    setTableSorting(tableId, []);
  }, [tableId, setTableSorting]);

  return {
    sorting,
    setSorting,
    resetSorting,
  };
}
