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
  showFilters: boolean;
  toggleShowFilters: () => void;
  headerSlot: React.ReactNode;
  setHeaderSlot: (slot: React.ReactNode) => void;
}

const name = "LayoutStore";

/**
 * Zustand store to manage layout state such as view mode and filter visibility.
 * The store is persisted in local storage except for the header slot.
 */
export const useLayoutStore = create<LayoutStore>()(
  persist(
    devtools(
      (set) => ({
        viewMode: "grid-md",
        setViewMode: (mode) => set({ viewMode: mode }, false, "setViewMode"),
        showFilters: true,
        toggleShowFilters: () =>
          set(
            (state) => ({ showFilters: !state.showFilters }),
            false,
            "toggleShowFilters",
          ),
        headerSlot: null,
        setHeaderSlot: (headerSlot) => set({ headerSlot }),
      }),
      { name },
    ),
    {
      name,
      version: 1,
      migrate: createMigrate<{ viewMode: ViewMode }>(
        {
          0: (state) => {
            const s = state as { viewMode?: string };
            return {
              viewMode: VALID_VIEW_MODES.includes(s?.viewMode as ViewMode)
                ? (s.viewMode as ViewMode)
                : "grid-md",
            };
          },
        },
        { viewMode: "grid-md" },
      ),
      partialize: (state) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { headerSlot, setHeaderSlot, ...rest } = state;
        return rest;
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.error("[LayoutStore] Rehydration failed:", error);
      },
    },
  ),
);
