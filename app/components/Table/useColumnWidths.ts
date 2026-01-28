import type { ColumnSizingState, OnChangeFn } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { useStore } from "zustand";

import { useTableStore } from "./state/useTableStore";
import { ColumnConfig } from "./types";

/**
 * Manages column width state for a table with persistence.
 *
 * Column widths are derived from persisted values (if available) or fall back
 * to the default sizes defined in column config. Width changes are automatically
 * synced to the table's store for persistence across sessions.
 *
 * The index column always has a fixed width of 48px and is not persisted.
 */
export function useColumnWidths(columns: ColumnConfig[], tableId: string) {
  const store = useTableStore(tableId);

  // Subscribe to column widths from the table store
  const columnWidths = useStore(store, (state) => state.columnWidths);
  const setColumnWidth = useStore(store, (state) => state.setColumnWidth);
  const reset = useStore(store, (state) => state.reset);

  // Derive columnSizing from store or defaults
  const columnSizing = useMemo(() => {
    const sizing: ColumnSizingState = { index: 48 };

    columns.forEach((col) => {
      sizing[col.id] = columnWidths[col.id] ?? col.size;
    });

    return sizing;
  }, [columns, columnWidths]);

  // Persist width changes to store
  const setColumnSizing: OnChangeFn<ColumnSizingState> = useCallback(
    (updaterOrValue) => {
      // Read fresh state from store
      const currentWidths = store.getState().columnWidths;
      const currentSizing: ColumnSizingState = { index: 48 };

      columns.forEach((col) => {
        currentSizing[col.id] = currentWidths[col.id] ?? col.size;
      });

      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(currentSizing)
          : updaterOrValue;

      // Update only columns that changed (skip index column)
      Object.entries(next).forEach(([columnId, width]) => {
        if (columnId !== "index" && currentSizing[columnId] !== width) {
          setColumnWidth(columnId, width);
        }
      });
    },
    [store, columns, setColumnWidth],
  );

  const resetWidths = useCallback(() => {
    reset();
  }, [reset]);

  return { columnSizing, setColumnSizing, resetWidths };
}
