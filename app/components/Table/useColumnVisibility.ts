import type { OnChangeFn, VisibilityState } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { useStore } from "zustand";

import { useTableStore } from "./state/useTableStore";
import { ColumnConfig } from "./types";

/**
 * Manages column visibility state with persistence and anchor enforcement.
 *
 * Visibility is derived from (in priority order):
 * 1. Stored preference (persisted across sessions)
 * 2. Column's `defaultVisible` config (defaults to true if omitted)
 * 3. Anchor columns are always forced visible
 */
export function useColumnVisibility(columns: ColumnConfig[], tableId: string) {
  const store = useTableStore(tableId);

  const storedVisibility = useStore(store, (s) => s.columnVisibility);
  const setVisibilityStore = useStore(store, (s) => s.setColumnVisibility);

  const columnVisibility: VisibilityState = useMemo(() => {
    const vis: VisibilityState = {};
    columns.forEach((col) => {
      if (col.anchor) {
        vis[col.id] = true;
      } else {
        vis[col.id] =
          storedVisibility[col.id] ?? (col.defaultVisible !== false);
      }
    });
    return vis;
  }, [columns, storedVisibility]);

  const setColumnVisibility: OnChangeFn<VisibilityState> = useCallback(
    (updaterOrValue) => {
      const current = store.getState().columnVisibility;
      const currentFull: VisibilityState = {};
      columns.forEach((col) => {
        currentFull[col.id] =
          current[col.id] ?? (col.defaultVisible !== false);
      });

      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(currentFull)
          : updaterOrValue;

      // Enforce anchors
      columns.forEach((col) => {
        if (col.anchor) next[col.id] = true;
      });

      setVisibilityStore(next);
    },
    [store, columns, setVisibilityStore],
  );

  const toggleableColumns = useMemo(
    () => columns.filter((col) => !col.anchor),
    [columns],
  );

  const toggleColumn = useCallback(
    (columnId: string) => {
      setColumnVisibility((prev) => ({
        ...prev,
        [columnId]: !prev[columnId],
      }));
    },
    [setColumnVisibility],
  );

  return {
    columnVisibility,
    setColumnVisibility,
    toggleableColumns,
    toggleColumn,
  };
}
