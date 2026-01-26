import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface DirectoryStore {
  activeTab: number;
  setActiveTab: (tabIndex: number) => void;
  provider?: string;
  setProvider: (provider: string) => void;
  bucketName?: string;
  setBucketName: (bucketName: string) => void;
  pathName?: string;
  setPathName: (pathName?: string) => void;
  headerSlot: React.ReactNode;
  setHeaderSlot: (slot: React.ReactNode) => void;
  tableColumns: Record<string, Record<string, { width: number }>>;
  setColumnWidth: (tableId: string, columnName: string, width: number) => void;
  getColumnWidth: (tableId: string, columnName: string, defaultWidth?: number) => number | undefined;
  resetColumnWidths: (tableId: string) => void;
  tableSorting: Record<string, { id: string; desc: boolean }[]>;
  setTableSorting: (tableId: string, sorting: { id: string; desc: boolean }[]) => void;
  getTableSorting: (tableId: string) => { id: string; desc: boolean }[] | undefined;
  resetTableSorting: (tableId: string) => void;
}

const name = "DirectoryStore";

/**
 * Zustand store to manage layout state such as active tab, bucket name, and path name.
 * The store is persisted in local storage except for the header slot.
 */
export const useDirectoryStore = create<DirectoryStore>()(
  persist(
    devtools(
      (set, get) => ({
        activeTab: 0,
        setActiveTab: (tabIndex) =>
          set({ activeTab: tabIndex }, false, "setActiveTab"),
        setProvider: (provider: string) =>
          set({ provider }, false, "setProvider"),
        setBucketName: (bucketName: string) =>
          set({ bucketName }, false, "setBucketName"),
        setPathName: (pathName?: string) =>
          set({ pathName }, false, "setPathName"),
        headerSlot: null,
        setHeaderSlot: (headerSlot) => set({ headerSlot }),
        tableColumns: {},
        setColumnWidth: (tableId: string, columnName: string, width: number) =>
          set(
            (state) => ({
              tableColumns: {
                ...state.tableColumns,
                [tableId]: {
                  ...state.tableColumns[tableId],
                  [columnName]: { width },
                },
              },
            }),
            false,
            "setColumnWidth",
          ),
        getColumnWidth: (tableId: string, columnName: string, defaultWidth?: number) => {
          const column = get().tableColumns[tableId]?.[columnName];
          return column?.width ?? defaultWidth;
        },
        resetColumnWidths: (tableId: string) =>
          set(
            (state) => ({
              tableColumns: {
                ...state.tableColumns,
                [tableId]: {},
              },
            }),
            false,
            "resetColumnWidths",
          ),
        tableSorting: {},
        setTableSorting: (tableId: string, sorting: { id: string; desc: boolean }[]) =>
          set(
            (state) => ({
              tableSorting: {
                ...state.tableSorting,
                [tableId]: sorting,
              },
            }),
            false,
            "setTableSorting",
          ),
        getTableSorting: (tableId: string) => {
          return get().tableSorting[tableId];
        },
        resetTableSorting: (tableId: string) =>
          set(
            (state) => ({
              tableSorting: {
                ...state.tableSorting,
                [tableId]: [],
              },
            }),
            false,
            "resetTableSorting",
          ),
      }),

      { name },
    ),
    {
      name,
      partialize: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { headerSlot, setHeaderSlot, ...rest } = state;
        return rest;
      },
    },
  ),
);
