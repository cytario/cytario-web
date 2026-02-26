import type {
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import { createStore } from "zustand";
import { devtools, persist } from "zustand/middleware";

export interface TableStore {
  tableId: string;

  columnWidths: Record<string, number>;
  sorting: SortingState;
  columnVisibility: VisibilityState;
  columnFilters: ColumnFiltersState;

  setColumnWidth: (columnId: string, width: number) => void;
  setSorting: (sorting: SortingState) => void;
  setColumnVisibility: (visibility: VisibilityState) => void;
  setColumnFilters: (filters: ColumnFiltersState) => void;

  reset: () => void;
}

export const createTableStore = (tableId: string) =>
  createStore<TableStore>()(
    persist(
      devtools(
        (set) => ({
          tableId,
          columnWidths: {},
          sorting: [],
          columnVisibility: {},
          columnFilters: [],

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

          setColumnVisibility: (columnVisibility: VisibilityState) =>
            set({ columnVisibility }, false, "setColumnVisibility"),

          setColumnFilters: (columnFilters: ColumnFiltersState) =>
            set({ columnFilters }, false, "setColumnFilters"),

          reset: () =>
            set(
              {
                columnWidths: {},
                sorting: [],
                columnVisibility: {},
                columnFilters: [],
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
