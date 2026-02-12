import type { SortingState } from "@tanstack/react-table";
import { createStore } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * Store interface for managing table state (column widths and sorting).
 */
export interface TableStore {
  /**
   * Unique identifier for this table instance
   */
  tableId: string;

  /**
   * Column width configuration keyed by column ID
   */
  columnWidths: Record<string, number>;

  /**
   * Sorting state for the table
   */
  sorting: SortingState;

  /**
   * Updates the width of a specific column
   */
  setColumnWidth: (columnId: string, width: number) => void;

  /**
   * Updates the sorting state for the table
   */
  setSorting: (sorting: SortingState) => void;

  /**
   * Resets all table configuration (widths and sorting) to defaults
   */
  reset: () => void;
}

/**
 * Creates a Zustand store for managing table state (column widths and sorting).
 *
 * Each table instance gets its own isolated store, preventing cross-table reactivity
 * issues. State is persisted to localStorage by tableId.
 *
 * Uses Zustand middlewares:
 * - `persist`: Persists column widths and sorting to localStorage
 * - `devtools`: Enables Redux DevTools integration for debugging
 *
 * @param tableId - Unique identifier for the table instance, used for persistence key and devtools name
 * @returns A Zustand store instance with the complete TableStore interface
 *
 * @example
 * ```tsx
 * const store = createTableStore("files-table");
 * const columnWidths = store.getState().columnWidths;
 * store.getState().setColumnWidth("name", 200);
 * ```
 */
export const createTableStore = (tableId: string) =>
  createStore<TableStore>()(
    persist(
      devtools(
        (set) => ({
          tableId,
          columnWidths: {},
          sorting: [],

          setColumnWidth: (columnId: string, width: number) =>
            set(
              (state) => ({
                columnWidths: {
                  ...state.columnWidths,
                  [columnId]: width,
                },
              }),
              false,
              "setColumnWidth",
            ),

          setSorting: (sorting: SortingState) =>
            set({ sorting }, false, "setSorting"),

          reset: () =>
            set(
              {
                columnWidths: {},
                sorting: [],
              },
              false,
              "reset",
            ),
        }),
        { name: `TableStore-${tableId}` },
      ),
      {
        name: `TableStore-${tableId}`,
      },
    ),
  );
