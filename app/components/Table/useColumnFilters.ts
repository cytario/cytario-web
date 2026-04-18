import type { ColumnFiltersState, OnChangeFn } from "@tanstack/react-table";
import { useCallback } from "react";
import { useStore } from "zustand";

import { useTableStore } from "./state/useTableStore";

interface UseColumnFiltersOptions {
  tableId: string;
}

/**
 * Manages column filter state via the per-table Zustand store (persisted to
 * localStorage). Callers sharing a `tableId` — Table, Grid, Tree — all see
 * the same filter state without prop drilling.
 *
 * See C-82 for the unification of filter UI across view modes; this hook is
 * the state layer that enables it.
 */
export function useColumnFilters({ tableId }: UseColumnFiltersOptions) {
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
