import type { ColumnSizingState, OnChangeFn } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";

import { ColumnConfig } from "./types";
import { useDirectoryStore } from "../DirectoryView/useDirectoryStore";

/**
 * Manages column width state for a table with persistence to the directory store.
 *
 * Column widths are derived from persisted values (if available) or fall back
 * to the default sizes defined in column config. Width changes are automatically
 * synced to the store for persistence across sessions.
 *
 * The index column always has a fixed width of 48px and is not persisted.
 */
export function useColumnWidths(columns: ColumnConfig[], tableId: string) {
  const { tableColumns, setColumnWidth, resetTableConfig } = useDirectoryStore();

  // Derive columnSizing from store or defaults
  const columnSizing = useMemo(() => {
    const sizing: ColumnSizingState = { index: 48 };
    const tableConfig = tableColumns[tableId];

    columns.forEach((col) => {
      sizing[col.id] = tableConfig?.[col.id]?.width ?? col.size;
    });

    return sizing;
  }, [columns, tableId, tableColumns]);

  // Persist width changes to store
  const setColumnSizing: OnChangeFn<ColumnSizingState> = useCallback(
    (updaterOrValue) => {
      const next =
        typeof updaterOrValue === "function"
          ? updaterOrValue(columnSizing)
          : updaterOrValue;

      Object.entries(next).forEach(([columnId, width]) => {
        if (columnId !== "index" && columnSizing[columnId] !== width) {
          setColumnWidth(tableId, columnId, width);
        }
      });
    },
    [tableId, columnSizing, setColumnWidth],
  );

  const resetWidths = useCallback(() => {
    resetTableConfig(tableId);
  }, [tableId, resetTableConfig]);

  return { columnSizing, setColumnSizing, resetWidths };
}
