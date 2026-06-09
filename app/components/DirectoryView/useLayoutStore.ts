import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

import { createMigrate } from "~/utils/persistMigration";

export type ViewMode = "list" | "grid" | "tree";
export type SidebarTab = "explorer" | "viewer";

export const SIDEBAR_MIN_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 720;
export const SIDEBAR_DEFAULT_WIDTH = 320;

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

// Carry the retired useFeatureBarStore width over so users keep their size.
function readLegacyWidth(): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
  try {
    const width = JSON.parse(window.localStorage.getItem("FeatureBar") ?? "")?.state?.width;
    return typeof width === "number" ? clampSidebarWidth(width) : SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

interface LayoutStore {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  showHiddenFiles: boolean;
  toggleShowHiddenFiles: () => void;
  showFilters: boolean;
  toggleShowFilters: () => void;
  headerSlot: React.ReactNode;
  setHeaderSlot: (slot: React.ReactNode) => void;

  // Navigation sidebar (C-56)
  sidebarOpen: boolean;
  sidebarWidth: number;
  sidebarTab: SidebarTab;
  sidebarSearchQuery: string;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarWidth: (width: number) => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setSidebarSearchQuery: (query: string) => void;

  // Viewer tab presence — set by the open image's <Viewer>. Boolean only:
  // never store DOM nodes here (devtools middleware would serialize them).
  viewerTabActive: boolean;
  setViewerTabActive: (active: boolean) => void;
}

interface PersistedLayoutState {
  viewMode: ViewMode;
  showHiddenFiles: boolean;
  showFilters: boolean;
  sidebarOpen: boolean;
  sidebarWidth: number;
  sidebarTab: SidebarTab;
}

const name = "LayoutStore";

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
        showFilters: false,
        toggleShowFilters: () =>
          set((state) => ({ showFilters: !state.showFilters }), false, "toggleShowFilters"),
        headerSlot: null,
        setHeaderSlot: (headerSlot) => set({ headerSlot }),

        sidebarOpen: true,
        sidebarWidth: readLegacyWidth(),
        sidebarTab: "explorer",
        sidebarSearchQuery: "",
        toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen }), false, "toggleSidebar"),
        setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }, false, "setSidebarOpen"),
        setSidebarWidth: (width) =>
          set({ sidebarWidth: clampSidebarWidth(width) }, false, "setSidebarWidth"),
        setSidebarTab: (sidebarTab) => set({ sidebarTab }, false, "setSidebarTab"),
        setSidebarSearchQuery: (sidebarSearchQuery) =>
          set({ sidebarSearchQuery }, false, "setSidebarSearchQuery"),

        viewerTabActive: false,
        setViewerTabActive: (viewerTabActive) =>
          set({ viewerTabActive }, false, "setViewerTabActive"),
      }),
      { name },
    ),
    {
      name,
      version: 6,
      migrate: createMigrate<PersistedLayoutState>(
        {
          0: (state) => {
            const s = state as { viewMode?: string };
            const OLD_VALID = ["list", "list-wide", "grid-sm", "grid-md", "grid-lg"];
            return {
              viewMode: OLD_VALID.includes(s?.viewMode ?? "") ? (s.viewMode as string) : "grid",
              showHiddenFiles: false,
              showFilters: false,
            };
          },
          1: (state) => {
            const s = state as { viewMode?: string };
            const OLD_VALID = ["list", "list-wide", "grid-sm", "grid-md", "grid-lg"];
            return {
              viewMode: OLD_VALID.includes(s?.viewMode ?? "") ? (s.viewMode as string) : "grid",
              showHiddenFiles: false,
              showFilters: false,
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
              showFilters: false,
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
              showFilters: false,
            };
          },
          4: (state) => {
            const s = state as {
              viewMode?: string;
              showHiddenFiles?: boolean;
              showFilters?: boolean;
            };
            return {
              viewMode: (s?.viewMode === "grid-compact"
                ? "grid"
                : (s?.viewMode ?? "grid")) as ViewMode,
              showHiddenFiles: s?.showHiddenFiles ?? false,
              showFilters: s?.showFilters ?? false,
            };
          },
          5: (state) => {
            const s = state as Partial<PersistedLayoutState>;
            return {
              viewMode: (s?.viewMode ?? "grid") as ViewMode,
              showHiddenFiles: s?.showHiddenFiles ?? false,
              showFilters: s?.showFilters ?? false,
              sidebarOpen: true,
              sidebarWidth: readLegacyWidth(),
              sidebarTab: "explorer",
            };
          },
        },
        {
          viewMode: "grid",
          showHiddenFiles: false,
          showFilters: false,
          sidebarOpen: true,
          sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
          sidebarTab: "explorer",
        },
      ),
      partialize: (state) => ({
        viewMode: state.viewMode,
        showHiddenFiles: state.showHiddenFiles,
        showFilters: state.showFilters,
        sidebarOpen: state.sidebarOpen,
        sidebarWidth: state.sidebarWidth,
        sidebarTab: state.sidebarTab,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.error("[LayoutStore] Rehydration failed:", error);
      },
    },
  ),
);
