import { temporal } from "zundo";
import { createStore } from "zustand";
import { devtools, persist, subscribeWithSelector } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { createAnnotationsSlice } from "./annotations/annotations.store";
import { createChannelsSlice } from "./channels/channels.store";
import { withAutoFork } from "./core/autoFork";
import { createCoreSlice } from "./core/core.store";
import { debouncedStorage, viewerStoreMigrate, viewerStorePartialize } from "./core/persistence";
import { createTemporalOptions, type TemporalState } from "./core/viewerTemporal";
import { createViewSlice } from "./core/viewport.store";
import { createOverlaysSlice } from "./overlays/overlays.store";
import type { ViewerStore } from "./types";
import { createViewsSlice } from "./views/views.store";

/**
 * Creates a Zustand store for one image-viewer instance, composed from domain
 * slices over the `subscribeWithSelector → persist → immer → devtools → temporal`
 * middleware stack. `temporal` (zundo) is innermost so it intercepts every `set`
 * first, snapshotting the pre-mutation state into the undo/redo history. The
 * `TemporalState` (cool-off controller) is attached as a property on the returned
 * store so the `useUndoRedo` hook can reset the gesture debounce before undo/redo.
 */
export const createViewerStore = (id: string, userId: string = "") => {
  const { options: temporalOptions, temporalState } = createTemporalOptions();

  const store = createStore<ViewerStore>()(
    subscribeWithSelector(
      persist(
        immer(
          devtools(
            temporal(
              withAutoFork((set, get, storeApi) => ({
                id,
                currentUserId: userId,
                ...createCoreSlice(set, get, storeApi),
                ...createViewSlice(set, get, storeApi),
                ...createViewsSlice(set, get, storeApi),
                ...createChannelsSlice(set, get, storeApi),
                ...createOverlaysSlice(set, get, storeApi),
                ...createAnnotationsSlice(set, get, storeApi),
              })),
              temporalOptions,
            ),
            {
              name: "ViewerStore-" + id,
            },
          ),
        ),
        {
          name: "ViewerStore-" + id,
          version: 6,
          migrate: viewerStoreMigrate,
          partialize: viewerStorePartialize,
          storage: debouncedStorage,
          onRehydrateStorage: () => (_state, error) => {
            if (error) {
              console.error(`[ViewerStore-${id}] Rehydration failed:`, error);
            }
          },
        },
      ),
    ),
  );

  (store as unknown as { __temporalState?: TemporalState }).__temporalState = temporalState;

  return store;
};
