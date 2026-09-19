import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export const SIDEBAR_MIN_WIDTH = 320;
export const SIDEBAR_MAX_WIDTH = 720;
export const SIDEBAR_DEFAULT_WIDTH = 320;

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

export interface SidebarStore {
  isOpen: boolean;
  width: number;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
}

interface SidebarStoreOptions {
  name: string;
  defaultOpen?: boolean;
  defaultWidth?: number;
}

export type SidebarStoreApi = ReturnType<typeof createSidebarStore>;

// Separate stores/persist keys per sidebar so each remembers its own state.
export function createSidebarStore({
  name,
  defaultOpen = true,
  defaultWidth = SIDEBAR_DEFAULT_WIDTH,
}: SidebarStoreOptions) {
  return create<SidebarStore>()(
    persist(
      devtools(
        (set) => ({
          isOpen: defaultOpen,
          width: defaultWidth,
          toggle: () => set((s) => ({ isOpen: !s.isOpen }), false, "toggle"),
          setOpen: (isOpen) => set({ isOpen }, false, "setOpen"),
          setWidth: (width) => set({ width: clampSidebarWidth(width) }, false, "setWidth"),
        }),
        { name },
      ),
      {
        name,
        // SSR: rehydrate in an effect (useRehydrateSidebar); persist prefs only.
        skipHydration: true,
        partialize: (s) => ({ isOpen: s.isOpen, width: s.width }),
      },
    ),
  );
}
