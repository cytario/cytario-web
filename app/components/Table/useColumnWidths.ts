import type { ColumnSizingState, OnChangeFn } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ColumnConfig } from "./types";
import { useDirectoryStore } from "../DirectoryView/useDirectoryStore";

export function useColumnWidths(columns: ColumnConfig[], tableId: string) {
  const { tableColumns, setColumnWidth, resetColumnWidths } = useDirectoryStore();

  // Initialize columnSizing state from store or defaults
  const initialColumnSizing = useMemo(() => {
    const sizing: ColumnSizingState = {};

    columns.forEach((col) => {
      const persistedWidth = tableColumns[tableId]?.[col.id]?.width;
      sizing[col.id] = persistedWidth ?? col.size;
    });

    // Add index column with fixed width
    sizing.index = 48;

    return sizing;
  }, [columns, tableId, tableColumns]);

  const [columnSizing, setColumnSizingState] =
    useState<ColumnSizingState>(initialColumnSizing);

  // Sync to store when columnSizing changes
  const setColumnSizing: OnChangeFn<ColumnSizingState> = useCallback(
    (updaterOrValue) => {
      setColumnSizingState((prev) => {
        const next =
          typeof updaterOrValue === "function"
            ? updaterOrValue(prev)
            : updaterOrValue;

        // Persist each changed column width to store
        Object.entries(next).forEach(([columnId, width]) => {
          if (columnId !== "index" && prev[columnId] !== width) {
            setColumnWidth(tableId, columnId, width);
          }
        });

        return next;
      });
    },
    [tableId, setColumnWidth],
  );

  // Reset widths to defaults
  const resetWidths = useCallback(() => {
    resetColumnWidths(tableId);

    // Reset local state to defaults
    const defaultSizing: ColumnSizingState = {};
    columns.forEach((col) => {
      defaultSizing[col.id] = col.size;
    });
    defaultSizing.index = 48;

    setColumnSizingState(defaultSizing);
  }, [tableId, columns, resetColumnWidths]);

  // Update state when persisted widths change (e.g., from another tab)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setColumnSizingState((prev) => {
      const updated = { ...prev };
      let hasChanges = false;

      columns.forEach((col) => {
        const persistedWidth = tableColumns[tableId]?.[col.id]?.width;
        if (persistedWidth !== undefined && prev[col.id] !== persistedWidth) {
          updated[col.id] = persistedWidth;
          hasChanges = true;
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [tableColumns, tableId, columns]);

  return {
    columnSizing,
    setColumnSizing,
    resetWidths,
  };
}
