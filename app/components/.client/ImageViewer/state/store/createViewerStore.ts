import { temporal } from "zundo";
import { createStore } from "zustand";
import { devtools, persist, subscribeWithSelector } from "zustand/middleware";
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
 * the undo/redo history. Only `id` lives at the root; it keys persistence +
 * devtools.
 *
 * The `TemporalState` (cool-off controller) is attached as a property on the
 * returned store so the `useUndoRedo` hook can reset the gesture debounce
 * before calling undo/redo.
 */
export const createViewerStore = (id: string) => {
  const { options: temporalOptions, temporalState } = createTemporalOptions();

  const store = createStore<ViewerStore>()(
    subscribeWithSelector(
      persist(
        immer(
          devtools(
            temporal(
              (set, get, storeApi) => ({
                id,
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
          version: 2,
          migrate: viewerStoreMigrate,
          partialize: viewerStorePartialize,
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
  // gesture debounce before performing undo/redo (prevents a leftover
  // cool-off from swallowing the first post-undo edit).
  (store as unknown as { __temporalState?: TemporalState }).__temporalState = temporalState;

  return store;
};
