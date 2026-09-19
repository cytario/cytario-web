import { createJSONStorage } from "zustand/middleware";

import type { ViewerStore } from "../types";
import { createMigrate } from "~/utils/persistMigration";

/** The subset of viewer state persisted to localStorage — the single source of
 *  truth for both the migrate fallback and `createViewerStore`'s `partialize`. */
type PersistedViewerState = Pick<
  ViewerStore,
  | "currentUserId"
  | "selectedChannelId"
  | "imagePanelIndex"
  | "imagePanels"
  | "layersStates"
  | "channels"
  | "channelIds"
  | "viewStateActive"
  | "annotationClasses"
  | "annotationActiveClass"
>;

const VIEWER_FALLBACK_STATE: PersistedViewerState = {
  currentUserId: "",
  selectedChannelId: null,
  imagePanelIndex: -1,
  imagePanels: [],
  layersStates: [],
  channels: {},
  channelIds: [],
  viewStateActive: null,
  annotationClasses: [],
  annotationActiveClass: null,
};

export const viewerStoreMigrate = createMigrate<PersistedViewerState>(
  {
    0: (state) => {
      const s = state as Record<string, unknown>;
      return {
        selectedChannelId: null,
        imagePanelIndex: -1,
        imagePanels: [],
        layersStates: [],
        viewStateActive: s?.viewStateActive ?? null,
      };
    },
    // resourceId format changed from provider/bucket/path to connectionName/path;
    // clear persisted overlay keys — they'll be re-added on next use.
    1: (state) => {
      const s = state as PersistedViewerState;
      return {
        ...s,
        layersStates: (s.layersStates ?? []).map((ls) => ({
          ...ls,
          overlays: {},
        })),
      };
    },
    // Annotation opacity + outline toggle are now persisted; backfill defaults for
    // stores saved before this change.
    2: (state) => {
      const s = state as Record<string, unknown> & Partial<PersistedViewerState>;
      return {
        ...s,
        annotationsOpacity: (s.annotationsOpacity as number | undefined) ?? 1,
        showAnnotationOutline: (s.showAnnotationOutline as boolean | undefined) ?? true,
      } as PersistedViewerState & {
        annotationsOpacity: number;
        showAnnotationOutline: boolean;
      };
    },
    // annotationsOpacity and showAnnotationOutline moved from top-level persisted
    // state into per-preset layersStates entries; migrate the old top-level values
    // into every existing layersStates entry.
    3: (state) => {
      const s = state as Record<string, unknown> & Partial<PersistedViewerState>;
      const oldOpacity = (s.annotationsOpacity as number | undefined) ?? 1;
      const oldOutline = (s.showAnnotationOutline as boolean | undefined) ?? true;
      const rest = { ...s };
      delete (rest as Record<string, unknown>).annotationsOpacity;
      delete (rest as Record<string, unknown>).showAnnotationOutline;
      return {
        ...rest,
        layersStates: (rest.layersStates ?? []).map((ls) => ({
          ...ls,
          annotationsOpacity: ls.annotationsOpacity ?? oldOpacity,
          showAnnotationOutline: ls.showAnnotationOutline ?? oldOutline,
        })),
      } as PersistedViewerState;
    },
    // Persisted state now carries a top-level currentUserId used to filter layersStates
    // per user; migrate by resetting to the fallback state.
    4: () => VIEWER_FALLBACK_STATE,
    // Overlay entries changed shape: a resource's value used to be the bare
    // marker record; it now carries { markers, config }. Wrap legacy values
    // (config re-derives on next load) and drop unparseable ones.
    5: (state) => {
      const s = state as Record<string, unknown> & Partial<PersistedViewerState>;
      const layersStates = (s.layersStates ?? []).map((ls) => {
        const overlays = ls.overlays ?? {};
        const migrated: Record<string, { markers: unknown; config: null }> = {};
        for (const [resourceId, value] of Object.entries(overlays as Record<string, unknown>)) {
          if (
            value &&
            typeof value === "object" &&
            "markers" in (value as Record<string, unknown>) &&
            (value as { config?: unknown }).config !== undefined
          ) {
            migrated[resourceId] = value as { markers: unknown; config: null };
          } else if (value && typeof value === "object") {
            migrated[resourceId] = { markers: value, config: null };
          }
        }
        return { ...ls, overlays: migrated };
      });
      return { ...s, layersStates } as PersistedViewerState;
    },
  },
  VIEWER_FALLBACK_STATE,
);

export const viewerStorePartialize = (state: ViewerStore): PersistedViewerState => {
  const own = state.layersStates.filter((ls) => ls.author === state.currentUserId);
  // Remap panel → layerState pointers onto the filtered array: a panel
  // pointing at a filtered-out peer view must not survive the write as a
  // dangling index — after rehydrate the channels panel would read an
  // undefined layerState and silently fall back to channel defaults.
  // imagePanelIndex itself is a POSITION within imagePanels and is kept as-is.
  const remap = new Map(state.layersStates.map((ls) => [ls, own.indexOf(ls)] as const));
  const remapPointer = (i: number) => {
    const mapped = remap.get(state.layersStates[i]);
    return mapped === undefined || mapped < 0 ? (own.length > 0 ? 0 : -1) : mapped;
  };
  return {
    currentUserId: state.currentUserId,
    selectedChannelId: state.selectedChannelId,
    imagePanelIndex: state.imagePanelIndex,
    imagePanels: state.imagePanels.map(remapPointer),
    layersStates: own,
    channels: state.channels,
    channelIds: state.channelIds,
    viewStateActive: state.viewStateActive,
    annotationClasses: state.annotationClasses,
    annotationActiveClass: state.annotationActiveClass,
  };
};

/**
 * Custom persist merge that clamps panel pointers to the rehydrated
 * layersStates. The partialize remap keeps newly written state consistent,
 * but sessions persisted before the remap (or by any other writer) can carry
 * dangling indices — without the clamp the channels panel reads an undefined
 * layerState and silently falls back to channel defaults.
 */
export const viewerStoreMerge = (persisted: unknown, current: ViewerStore): ViewerStore => {
  const p = (persisted ?? {}) as Partial<ViewerStore>;
  const max = Array.isArray(p.layersStates) ? p.layersStates.length : 0;
  const panels = (p.imagePanels ?? []).filter((i) => i >= 0 && i < max);
  const imagePanels = panels.length > 0 ? panels : max > 0 ? [0] : [];
  const imagePanelIndex =
    max === 0 ? -1 : Math.min(Math.max(p.imagePanelIndex ?? -1, -1), imagePanels.length - 1);
  return { ...current, ...p, imagePanels, imagePanelIndex } as ViewerStore;
};

const PERSIST_DEBOUNCE_MS = 500;
const pendingWrites = new Map<string, string>();
let flushRegistered = false;

function flushPendingWrites() {
  for (const [name, value] of pendingWrites) {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Quota errors surface via the persist middleware's own handler.
    }
  }
  pendingWrites.clear();
}

if (typeof window !== "undefined" && !flushRegistered) {
  flushRegistered = true;
  window.addEventListener("pagehide", flushPendingWrites);
}

/** localStorage-backed StateStorage with a debounced write side. */
function createDebouncedStorage(debounceMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    getItem: (name: string) => localStorage.getItem(name),
    setItem: (name: string, value: string) => {
      pendingWrites.set(name, value);
      clearTimeout(timer);
      timer = setTimeout(() => {
        flushPendingWrites();
      }, debounceMs);
    },
    removeItem: (name: string) => {
      pendingWrites.delete(name);
      localStorage.removeItem(name);
    },
  };
}

export const debouncedStorage = createJSONStorage(() =>
  createDebouncedStorage(PERSIST_DEBOUNCE_MS),
);
