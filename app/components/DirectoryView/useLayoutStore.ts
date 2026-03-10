import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

import { createMigrate } from "~/utils/persistMigration";

export type ViewMode = "list" | "list-wide" | "grid-sm" | "grid-md" | "grid-lg";

const VALID_VIEW_MODES: ViewMode[] = [
  "list",
  "list-wide",
  "grid-sm",
  "grid-md",
  "grid-lg",
];

interface LayoutStore {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  showHiddenFiles: boolean;
  toggleShowHiddenFiles: () => void;
  headerSlot: React.ReactNode;
  setHeaderSlot: (slot: React.ReactNode) => void;
}

interface PersistedLayoutState {
  viewMode: ViewMode;
  sidebarOpen: boolean;
  showHiddenFiles: boolean;
}

const name = "LayoutStore";

/**
 * Zustand store to manage layout state such as view mode, sidebar, and
 * hidden-file visibility. The store is persisted in local storage except
 * for the header slot.
 */
export const useLayoutStore = create<LayoutStore>()(
  persist(
    devtools(
      (set) => ({
        viewMode: "grid-md",
        setViewMode: (mode) => set({ viewMode: mode }, false, "setViewMode"),
        sidebarOpen: false,
        setSidebarOpen: (open) =>
          set({ sidebarOpen: open }, false, "setSidebarOpen"),
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
      version: 2,
      migrate: createMigrate<PersistedLayoutState>(
        {
          0: (state) => {
            const s = state as { viewMode?: string };
            return {
              viewMode: VALID_VIEW_MODES.includes(s?.viewMode as ViewMode)
                ? (s.viewMode as ViewMode)
                : "grid-md",
            };
          },
          1: (state) => {
            const s = state as { viewMode?: ViewMode };
            return {
              viewMode: VALID_VIEW_MODES.includes(s?.viewMode as ViewMode)
                ? (s.viewMode as ViewMode)
                : "grid-md",
              sidebarOpen: false,
              showHiddenFiles: false,
            };
          },
        },
        { viewMode: "grid-md", sidebarOpen: false, showHiddenFiles: false },
      ),
      partialize: (state) => ({
        viewMode: state.viewMode,
        sidebarOpen: state.sidebarOpen,
        showHiddenFiles: state.showHiddenFiles,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.error("[LayoutStore] Rehydration failed:", error);
      },
    },
  ),
);
