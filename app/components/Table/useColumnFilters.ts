import type { ColumnFiltersState, OnChangeFn } from "@tanstack/react-table";
import { useCallback } from "react";
import { useStore } from "zustand";

import { useTableStore } from "./state/useTableStore";

interface UseColumnFiltersOptions {
  tableId: string;
  controlledFilters?: ColumnFiltersState;
  onControlledFiltersChange?: OnChangeFn<ColumnFiltersState>;
}

/**
 * Manages column filter state in controlled or uncontrolled mode.
 *
 * Controlled: when `controlledFilters` and `onControlledFiltersChange` are
 * provided, the parent owns the state (same pattern as rowSelection).
 *
 * Uncontrolled: falls back to the per-table Zustand store with persistence.
 */
export function useColumnFilters({
  tableId,
  controlledFilters,
  onControlledFiltersChange,
}: UseColumnFiltersOptions) {
  const store = useTableStore(tableId);

  const storeFilters = useStore(store, (s) => s.columnFilters);
  const setFiltersStore = useStore(store, (s) => s.setColumnFilters);

  const isControlled =
    controlledFilters !== undefined && onControlledFiltersChange !== undefined;

  const columnFilters = isControlled ? controlledFilters : storeFilters;

  const setColumnFilters: OnChangeFn<ColumnFiltersState> = useCallback(
    (updaterOrValue) => {
      if (isControlled) {
        onControlledFiltersChange(updaterOrValue);
      } else {
        const current = store.getState().columnFilters;
        const next =
          typeof updaterOrValue === "function"
            ? updaterOrValue(current)
            : updaterOrValue;
        setFiltersStore(next);
      }
    },
    [isControlled, onControlledFiltersChange, store, setFiltersStore],
  );

  const resetFilters = useCallback(() => {
    if (isControlled) {
      onControlledFiltersChange([]);
    } else {
      setFiltersStore([]);
    }
  }, [isControlled, onControlledFiltersChange, setFiltersStore]);

  return { columnFilters, setColumnFilters, resetFilters };
}
