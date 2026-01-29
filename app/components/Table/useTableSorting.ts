import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import { useCallback } from "react";
import { useStore } from "zustand";

import { useTableStore } from "./state/useTableStore";

/**
 * Manages sorting state for a table with persistence.
 *
 * The table store acts as the single source of truth for sorting state, enabling
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
  const store = useTableStore(tableId);

  // Subscribe to sorting from the table store
  const sorting = useStore(store, (state) => state.sorting);
  const setSortingStore = useStore(store, (state) => state.setSorting);
  const reset = useStore(store, (state) => state.reset);

  // Update store when sorting changes
  const setSorting: OnChangeFn<SortingState> = useCallback(
    (updaterOrValue) => {
      // Read fresh state from store
      const currentSorting = store.getState().sorting;

      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(currentSorting)
          : updaterOrValue;

      setSortingStore(next);
    },
    [store, setSortingStore],
  );

  // Reset sorting to default (empty)
  const resetSorting = useCallback(() => {
    reset();
  }, [reset]);

  return {
    sorting,
    setSorting,
    resetSorting,
  };
}
