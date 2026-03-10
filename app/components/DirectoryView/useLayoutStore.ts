import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

import { createMigrate } from "~/utils/persistMigration";

export type ViewMode = "list" | "grid" | "grid-compact" | "tree";

interface LayoutStore {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  showHiddenFiles: boolean;
  toggleShowHiddenFiles: () => void;
  headerSlot: React.ReactNode;
  setHeaderSlot: (slot: React.ReactNode) => void;
}

interface PersistedLayoutState {
  viewMode: ViewMode;
  showHiddenFiles: boolean;
}

const name = "LayoutStore";

/**
 * Zustand store to manage layout state such as view mode and hidden-file
 * visibility. The store is persisted in local storage except for the
 * header slot.
 */
export const useLayoutStore = create<LayoutStore>()(
  persist(
    devtools(
      (set) => ({
        viewMode: "grid",
        setViewMode: (mode) => set({ viewMode: mode }, false, "setViewMode"),
        showHiddenFiles: false,
        toggleShowHiddenFiles: () =>
          set(
            (state) => ({ showHiddenFiles: !state.showHiddenFiles }),
            false,
            "toggleShowHiddenFiles",
          ),
        headerSlot: null,
        setHeaderSlot: (headerSlot) => set({ headerSlot }),
      }),
      { name },
    ),
    {
      name,
      version: 3,
      migrate: createMigrate<PersistedLayoutState>(
        {
          0: (state) => {
            const s = state as { viewMode?: string };
            const OLD_VALID = [
              "list",
              "list-wide",
              "grid-sm",
              "grid-md",
              "grid-lg",
            ];
            return {
              viewMode: OLD_VALID.includes(s?.viewMode ?? "")
                ? (s.viewMode as string)
                : "grid",
            };
          },
          1: (state) => {
            const s = state as { viewMode?: string };
            const OLD_VALID = [
              "list",
              "list-wide",
              "grid-sm",
              "grid-md",
              "grid-lg",
            ];
            return {
              viewMode: OLD_VALID.includes(s?.viewMode ?? "")
                ? (s.viewMode as string)
                : "grid",
              showHiddenFiles: false,
            };
          },
          2: (state) => {
            const s = state as { viewMode?: string; showHiddenFiles?: boolean };
            const modeMap: Record<string, ViewMode> = {
              list: "list",
              "list-wide": "list",
              "grid-sm": "grid-compact",
              "grid-md": "grid",
              "grid-lg": "grid",
            };
            return {
              viewMode: modeMap[s?.viewMode ?? ""] ?? "grid",
              showHiddenFiles: s?.showHiddenFiles ?? false,
            };
          },
        },
        { viewMode: "grid", showHiddenFiles: false },
      ),
      partialize: (state) => ({
        viewMode: state.viewMode,
        showHiddenFiles: state.showHiddenFiles,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.error("[LayoutStore] Rehydration failed:", error);
      },
    },
  ),
);
