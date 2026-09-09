import { temporal } from "zundo";
import { createStore } from "zustand";
import { createJSONStorage, devtools, persist, subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { createAnnotationsSlice } from "./slices/viewer.annotations.store";
import { createChannelsSlice } from "./slices/viewer.channels.store";
import { createCoreSlice } from "./slices/viewer.core.store";
import { createOverlaysSlice } from "./slices/viewer.overlays.store";
import { createViewSlice } from "./slices/viewer.view.store";
import type { ViewerStore } from "./types";
import { viewerStoreMigrate, viewerStorePartialize } from "./viewerStore.persistence";
import { createTemporalOptions, type TemporalState } from "./viewerTemporal";

/**
 * Creates a Zustand store for one image-viewer instance. State + actions are
 * composed from domain slices (`slices/viewer.*.store.ts`) — core, view,
 * channels, overlays, annotations — over the
 * `subscribeWithSelector → persist → immer → devtools → temporal` middleware
 * stack. `subscribeWithSelector` lets the annotation autosave writer
 * subscribe to a single slice of state. `temporal` (zundo) is innermost so
 * it intercepts every `set` first, snapshotting the pre-mutation state into
 * the undo/redo history. `id` and `currentUserId` live at the root; `id`
 * keys persistence + devtools, `currentUserId` scopes per-user sidecar writes
 * and ownership guards.
 *
 * The `TemporalState` (cool-off controller) is attached as a property on the
 * returned store so the `useUndoRedo` hook can reset the gesture debounce
 * before calling undo/redo.
 */
export const createViewerStore = (id: string, userId: string = "") => {
  const { options: temporalOptions, temporalState } = createTemporalOptions();

  const store = createStore<ViewerStore>()(
    subscribeWithSelector(
      persist(
        immer(
          devtools(
            temporal(
              (set, get, storeApi) => ({
                id,
                currentUserId: userId,
                ...createCoreSlice(set, get, storeApi),
                ...createViewSlice(set, get, storeApi),
                ...createChannelsSlice(set, get, storeApi),
                ...createOverlaysSlice(set, get, storeApi),
                ...createAnnotationsSlice(set, get, storeApi),
              }),
              temporalOptions,
            ),
            {
              name: "ViewerStore-" + id,
            },
          ),
        ),
        {
          name: "ViewerStore-" + id,
          version: 5,
          migrate: viewerStoreMigrate,
          partialize: viewerStorePartialize,
          // Viewport-change frames would otherwise re-stringify the whole
          // partialized state (all channels' histograms included) and write it
          // to localStorage per frame — zustand persist has no debounce
          // option, so the write side is debounced via the storage wrapper.
          storage: createJSONStorage(() => createDebouncedStorage(PERSIST_DEBOUNCE_MS)),
          onRehydrateStorage: () => (_state, error) => {
            if (error) {
              console.error(`[ViewerStore-${id}] Rehydration failed:`, error);
            }
          },
        },
      ),
    ),
  );

  // Attach the cool-off controller so the undo/redo hook can reset the
  // gesture debounce before calling undo/redo (prevents a leftover cool-off
  // from swallowing the first post-undo edit).
  (store as unknown as { __temporalState?: TemporalState }).__temporalState = temporalState;

  return store;
};

/** Coalesces persist writes — pan/zoom produces a set per viewport frame. */
const PERSIST_DEBOUNCE_MS = 500;

/** localStorage-backed StateStorage with a debounced write side. */
function createDebouncedStorage(debounceMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingName: string | null = null;
  let pendingValue: string | null = null;
  return {
    getItem: (name: string) => localStorage.getItem(name),
    setItem: (name: string, value: string) => {
      pendingName = name;
      pendingValue = value;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (pendingName === null || pendingValue === null) return;
        try {
          localStorage.setItem(pendingName, pendingValue);
        } catch {
          // Quota errors surface via the persist middleware's own handler.
        }
        pendingName = null;
        pendingValue = null;
      }, debounceMs);
    },
    removeItem: (name: string) => {
      pendingName = null;
      localStorage.removeItem(name);
    },
  };
}
