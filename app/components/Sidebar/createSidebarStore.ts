import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export const SIDEBAR_MIN_WIDTH = 320;
export const SIDEBAR_MAX_WIDTH = 720;
export const SIDEBAR_DEFAULT_WIDTH = 320;

/** Below this viewport width no floating state is offered. */
export const FLOAT_MIN_VIEWPORT_WIDTH = 640;
export const FLOAT_INSET = 16;
export const FLOAT_CASCADE = 24;
/** Default floating panel width; wide pillars override at their spawn sites. */
export const FLOAT_PANEL_WIDTH = 320;
/** Slice of a panel kept inside the bounds box so its header stays reachable. */
export const FLOAT_MIN_VISIBLE_HEIGHT = 96;
export const FLOAT_KEYBOARD_STEP = 24;
export const FLOAT_KEYBOARD_STEP_LARGE = 96;
/** Panels stack above the canvas overlays and below CANVAS_CHROME_Z. */
export const FLOAT_Z_BASE = 40;
export const FLOAT_Z_RANGE = 9;
/** Mode toolbar and sidebar toggle — always reachable over any panel. */
export const CANVAS_CHROME_Z = 50;

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

/** Panel geometry relative to the bounds box origin, never viewport coordinates. */
export interface FloatRect {
  x: number;
  y: number;
  width: number;
}

/**
 * One record per section — the entire open/closed/floating state model:
 * `rect` present means floating (with its placement), absent means docked;
 * `isOpen` is the docked accordion state, kept and restored across floats.
 */
export interface SectionEntry {
  isOpen: boolean;
  rect?: FloatRect;
  /** Stacking order — session-transient, never persisted. */
  z?: number;
}

export interface BoundsBox {
  width: number;
  height: number;
}

interface Edges {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export function clampFloatRect(rect: FloatRect, bounds: BoundsBox): FloatRect {
  const width = bounds.width > 0 ? Math.min(rect.width, bounds.width) : rect.width;
  const maxX = Math.max(0, bounds.width - width);
  const maxY = Math.max(0, bounds.height - FLOAT_MIN_VISIBLE_HEIGHT);
  return {
    width,
    x: Math.min(Math.max(rect.x, 0), maxX),
    y: Math.min(Math.max(rect.y, 0), maxY),
  };
}

/** Cascaded spawn position so successive floats do not stack exactly on top of one another. */
export function nextFloatRect(bounds: BoundsBox, width: number, floatingCount: number): FloatRect {
  const offset = FLOAT_INSET + floatingCount * FLOAT_CASCADE;
  return clampFloatRect({ x: offset, y: offset, width }, bounds);
}

export function offsetFloatRect(rect: FloatRect, dx: number, dy: number): FloatRect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

/** Shift that uncovers `focus` from behind `panel`, or null when it is already visible. */
export function focusEscapeOffset(panel: Edges, focus: Edges): { dx: number; dy: number } | null {
  const covered =
    focus.left >= panel.left &&
    focus.right <= panel.right &&
    focus.top >= panel.top &&
    focus.bottom <= panel.bottom;
  if (!covered) return null;
  const down = focus.bottom - panel.top;
  const up = panel.bottom - focus.top;
  return down <= up ? { dx: 0, dy: down } : { dx: 0, dy: -up };
}

export interface SidebarStore {
  isOpen: boolean;
  width: number;
  /** Per-section state by id; absent = docked with default open state. */
  sections: Record<string, SectionEntry>;
  /** Stacking counter — session-transient, never persisted. */
  topZ: number;
  /** Hide-all toggle; panels keep their rects while hidden. */
  floatsHidden: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
  toggleSection: (sectionId: string) => void;
  float: (sectionId: string, rect: FloatRect) => void;
  dock: (sectionId: string) => void;
  move: (sectionId: string, rect: FloatRect) => void;
  bringToFront: (sectionId: string) => void;
  resetFloating: () => void;
  setFloatsHidden: (hidden: boolean) => void;
  clampFloating: (bounds: BoundsBox) => void;
}

interface PersistedSidebar {
  isOpen: boolean;
  width: number;
  sections: Record<string, { isOpen: boolean; rect?: FloatRect }>;
  /** Pre-consolidation shape — placements migrate, accordion prefs do not. */
  floating?: Record<string, { rect: FloatRect }>;
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
          sections: {},
          topZ: 0,
          floatsHidden: false,
          toggle: () => set((s) => ({ isOpen: !s.isOpen }), false, "toggle"),
          setOpen: (isOpen) => set({ isOpen }, false, "setOpen"),
          setWidth: (width) => set({ width: clampSidebarWidth(width) }, false, "setWidth"),
          toggleSection: (sectionId) =>
            set(
              (s) => ({
                sections: {
                  ...s.sections,
                  [sectionId]: {
                    isOpen: !(s.sections[sectionId]?.isOpen ?? true),
                  },
                },
              }),
              false,
              "toggleSection",
            ),
          float: (sectionId, rect) =>
            set(
              (s) => {
                const z = s.topZ + 1;
                return {
                  topZ: z,
                  // Floating a section shows the set — a hidden float would
                  // spawn a panel the user cannot see.
                  floatsHidden: false,
                  sections: {
                    ...s.sections,
                    [sectionId]: { isOpen: s.sections[sectionId]?.isOpen ?? true, rect, z },
                  },
                };
              },
              false,
              "float",
            ),
          // Docking keeps the entry: isOpen survives the round trip, only the
          // placement is dropped.
          dock: (sectionId) =>
            set(
              (s) => {
                if (!s.sections[sectionId]?.rect) return s;
                return {
                  sections: {
                    ...s.sections,
                    [sectionId]: { isOpen: s.sections[sectionId].isOpen },
                  },
                };
              },
              false,
              "dock",
            ),
          move: (sectionId, rect) =>
            set(
              (s) => {
                const current = s.sections[sectionId];
                if (!current?.rect) return s;
                return { sections: { ...s.sections, [sectionId]: { ...current, rect } } };
              },
              false,
              "move",
            ),
          bringToFront: (sectionId) =>
            set(
              (s) => {
                const current = s.sections[sectionId];
                if (!current?.rect || current.z === s.topZ) return s;
                const z = s.topZ + 1;
                return {
                  topZ: z,
                  sections: { ...s.sections, [sectionId]: { ...current, z } },
                };
              },
              false,
              "bringToFront",
            ),
          resetFloating: () =>
            set(
              (s) => ({
                sections: Object.fromEntries(
                  Object.entries(s.sections).map(([id, entry]) => [id, { isOpen: entry.isOpen }]),
                ),
                topZ: 0,
              }),
              false,
              "resetFloating",
            ),
          setFloatsHidden: (floatsHidden) => set({ floatsHidden }, false, "setFloatsHidden"),
          clampFloating: (bounds) =>
            set(
              (s) => {
                let changed = false;
                const sections: Record<string, SectionEntry> = {};
                for (const [id, entry] of Object.entries(s.sections)) {
                  if (!entry.rect) {
                    sections[id] = entry;
                    continue;
                  }
                  const rect = clampFloatRect(entry.rect, bounds);
                  changed ||= rect.x !== entry.rect.x || rect.y !== entry.rect.y;
                  sections[id] = { ...entry, rect };
                }
                return changed ? { sections } : s;
              },
              false,
              "clampFloating",
            ),
        }),
        { name },
      ),
      {
        name,
        // SSR: rehydrate in an effect (the shell); stacking order stays transient.
        skipHydration: true,
        partialize: (s): PersistedSidebar => ({
          isOpen: s.isOpen,
          width: s.width,
          sections: Object.fromEntries(
            Object.entries(s.sections).map(([id, entry]) => [
              id,
              { isOpen: entry.isOpen, ...(entry.rect ? { rect: entry.rect } : {}) },
            ]),
          ),
        }),
        merge: (persisted, current) => {
          const saved = (persisted ?? {}) as Partial<PersistedSidebar>;
          const sections: Record<string, SectionEntry> = {};
          let topZ = 0;
          // The consolidated map subsumes the old floating-only shape; legacy
          // per-section accordion prefs are deliberately not migrated.
          for (const [id, entry] of Object.entries(saved.sections ?? saved.floating ?? {})) {
            if (!entry) continue;
            sections[id] = { isOpen: entry.isOpen ?? true };
            if (entry.rect) sections[id] = { ...sections[id], rect: entry.rect, z: ++topZ };
          }
          return { ...current, ...saved, sections, topZ };
        },
      },
    ),
  );
}
