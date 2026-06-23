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

/**
 * Creates a Zustand store for one image-viewer instance. State + actions are
 * composed from domain slices (`slices/viewer.*.store.ts`) — core, view,
 * channels, overlays, annotations — over the
 * `subscribeWithSelector → persist → immer → devtools` middleware stack.
 * `subscribeWithSelector` lets the annotation autosave writer subscribe to a
 * single slice of state. Only `id` lives at the root; it keys persistence + devtools.
 */
export const createViewerStore = (id: string) =>
  createStore<ViewerStore>()(
    subscribeWithSelector(
      persist(
        immer(
          devtools(
            (set, get, store) => ({
              id,
              ...createCoreSlice(set, get, store),
              ...createViewSlice(set, get, store),
              ...createChannelsSlice(set, get, store),
              ...createOverlaysSlice(set, get, store),
              ...createAnnotationsSlice(set, get, store),
            }),
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
