import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type ViewMode = "list" | "list-wide" | "grid-sm" | "grid-md" | "grid-lg";

interface LayoutStore {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  headerSlot: React.ReactNode;
  setHeaderSlot: (slot: React.ReactNode) => void;
}

const name = "LayoutStore";

/**
 * Zustand store to manage layout state such as view mode.
 * The store is persisted in local storage except for the header slot.
 */
export const useLayoutStore = create<LayoutStore>()(
  persist(
    devtools(
      (set) => ({
        viewMode: "grid-md",
        setViewMode: (mode) => set({ viewMode: mode }, false, "setViewMode"),
        headerSlot: null,
        setHeaderSlot: (headerSlot) => set({ headerSlot }),
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
