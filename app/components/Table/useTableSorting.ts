import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { useCallback } from "react";

import { useDirectoryStore } from "../DirectoryView/useDirectoryStore";

/**
 * Manages sorting state for a table with persistence to the directory store.
 *
 * The store acts as the single source of truth for sorting state, enabling
 * sorting preferences to persist across page navigation and browser sessions.
 *
 * @param tableId - Unique identifier for the table (used as key in store)
 * @returns Object containing:
 *   - `sorting` - Current sorting state array
 *   - `setSorting` - Function to update sorting (compatible with TanStack Table)
 *   - `resetSorting` - Function to clear all sorting for this table
 *
 * @example
 * ```tsx
 * const { sorting, setSorting } = useTableSorting("files-table");
 *
 * const table = useReactTable({
 *   state: { sorting },
 *   onSortingChange: setSorting,
 * });
 * ```
 */
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
