import type { ColumnFiltersState, OnChangeFn } from "@tanstack/react-table";
import { useCallback } from "react";
import { useStore } from "zustand";

import { useTableStore } from "./state/useTableStore";

/**
 * Manages column filter state with persistence.
 *
 * Bridges the Zustand store with TanStack Table's `OnChangeFn<ColumnFiltersState>`.
 */
export function useColumnFilters(tableId: string) {
  const store = useTableStore(tableId);

  const columnFilters = useStore(store, (s) => s.columnFilters);
  const setFiltersStore = useStore(store, (s) => s.setColumnFilters);

  const setColumnFilters: OnChangeFn<ColumnFiltersState> = useCallback(
    (updaterOrValue) => {
      const current = store.getState().columnFilters;
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(current)
          : updaterOrValue;
      setFiltersStore(next);
    },
    [store, setFiltersStore],
  );

  const resetFilters = useCallback(() => {
    setFiltersStore([]);
  }, [setFiltersStore]);

  return { columnFilters, setColumnFilters, resetFilters };
}
