import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

import { createMigrate } from "~/utils/persistMigration";

export type ViewMode = "list" | "grid";

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
      version: 7,
      migrate: createMigrate<PersistedLayoutState>(
        {
          0: (state) => {
            const s = state as { viewMode?: string };
            const OLD_VALID = ["list", "list-wide", "grid-sm", "grid-md", "grid-lg"];
            return {
              viewMode: OLD_VALID.includes(s?.viewMode ?? "") ? (s.viewMode as string) : "grid",
              showHiddenFiles: false,
            };
          },
          1: (state) => {
            const s = state as { viewMode?: string };
            const OLD_VALID = ["list", "list-wide", "grid-sm", "grid-md", "grid-lg"];
            return {
              viewMode: OLD_VALID.includes(s?.viewMode ?? "") ? (s.viewMode as string) : "grid",
              showHiddenFiles: false,
            };
          },
          2: (state) => {
            const s = state as { viewMode?: string; showHiddenFiles?: boolean };
            const modeMap: Record<string, string> = {
              list: "list",
              "list-wide": "list",
              "grid-sm": "grid",
              "grid-md": "grid",
              "grid-lg": "grid",
            };
            return {
              viewMode: (modeMap[s?.viewMode ?? ""] ?? "grid") as ViewMode,
              showHiddenFiles: s?.showHiddenFiles ?? false,
            };
          },
          3: (state) => {
            const s = state as {
              viewMode?: string;
              showHiddenFiles?: boolean;
            };
            return {
              viewMode: (s?.viewMode === "grid-compact"
                ? "grid"
                : (s?.viewMode ?? "grid")) as ViewMode,
              showHiddenFiles: s?.showHiddenFiles ?? false,
            };
          },
          4: (state) => {
            const s = state as { viewMode?: string; showHiddenFiles?: boolean };
            return {
              viewMode: (s?.viewMode === "grid-compact"
                ? "grid"
                : (s?.viewMode ?? "grid")) as ViewMode,
              showHiddenFiles: s?.showHiddenFiles ?? false,
            };
          },
          5: (state) => {
            const s = state as { viewMode?: string; showHiddenFiles?: boolean };
            // Tree view mode removed — coerce to grid.
            return {
              viewMode: (s?.viewMode === "tree" ? "grid" : (s?.viewMode ?? "grid")) as ViewMode,
              showHiddenFiles: s?.showHiddenFiles ?? false,
            };
          },
          // Column filters moved into per-column popover triggers — the
          // show/hide toggle state is gone.
          6: (state) => {
            const s = state as { viewMode?: string; showHiddenFiles?: boolean };
            return {
              viewMode: (s?.viewMode ?? "grid") as ViewMode,
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
