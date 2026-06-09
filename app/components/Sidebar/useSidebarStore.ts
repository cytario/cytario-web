import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type SidebarTab = "explorer" | "viewer";

export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 720;
export const SIDEBAR_DEFAULT_WIDTH = 320;

interface SidebarStore {
  isOpen: boolean;
  width: number;
  activeTab: SidebarTab;
  searchQuery: string;

  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
  setActiveTab: (tab: SidebarTab) => void;
  setSearchQuery: (query: string) => void;
}

const STORE_NAME = "Sidebar";
const LEGACY_FEATUREBAR_KEY = "FeatureBar";

// Migrate the retired useFeatureBarStore width so users keep their panel size.
function readLegacyWidth(): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
  try {
    const raw = window.localStorage.getItem(LEGACY_FEATUREBAR_KEY);
    if (!raw) return SIDEBAR_DEFAULT_WIDTH;
    const width = JSON.parse(raw)?.state?.width;
    return typeof width === "number" ? clampWidth(width) : SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function clampWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

export const useSidebarStore = create<SidebarStore>()(
  persist(
    devtools(
      (set) => ({
        isOpen: true,
        width: readLegacyWidth(),
        activeTab: "explorer",
        searchQuery: "",

        toggleOpen: () => set((s) => ({ isOpen: !s.isOpen }), false, "toggleOpen"),
        setOpen: (isOpen) => set({ isOpen }, false, "setOpen"),
        setWidth: (width) => set({ width: clampWidth(width) }, false, "setWidth"),
        setActiveTab: (activeTab) => set({ activeTab }, false, "setActiveTab"),
        setSearchQuery: (searchQuery) => set({ searchQuery }, false, "setSearchQuery"),
      }),
      { name: STORE_NAME },
    ),
    {
      name: STORE_NAME,
      // searchQuery is session-scoped, not persisted.
      partialize: (s) => ({ isOpen: s.isOpen, width: s.width, activeTab: s.activeTab }),
    },
  ),
);
