import type { StoreApi } from "zustand";

import { createTableStore, type TableStore } from "./createTableStore";

// Global map of tableId -> store instance (singleton pattern)
const tableStores = new Map<string, StoreApi<TableStore>>();

/**
 * Gets or creates a table store instance for the given tableId.
 *
 * Store instances are singletons - the same tableId always returns the same store.
 * This ensures state persists across component unmounts and remounts.
 *
 * @param tableId - Unique identifier for the table
 * @returns The table store instance for this tableId
 *
 * @example
 * ```tsx
 * function MyTable() {
 *   const store = useTableStore("files-table");
 *   const columnWidths = store.getState().columnWidths;
 *   // ...
 * }
 * ```
 */
export function useTableStore(tableId: string): StoreApi<TableStore> {
  // Check if store already exists in global map
  let store = tableStores.get(tableId);

  if (!store) {
    // Create new store and register it
    store = createTableStore(tableId);
    tableStores.set(tableId, store);
  }

  return store;
}

/**
 * Gets the table store instance for a given tableId without React hooks.
 * Useful for accessing store outside of React components.
 *
 * @param tableId - Unique identifier for the table
 * @returns The table store instance or undefined if not yet created
 *
 * @example
 * ```tsx
 * const store = getTableStore("files-table");
 * if (store) {
 *   store.getState().reset();
 * }
 * ```
 */
export function getTableStore(
  tableId: string,
): StoreApi<TableStore> | undefined {
  return tableStores.get(tableId);
}
