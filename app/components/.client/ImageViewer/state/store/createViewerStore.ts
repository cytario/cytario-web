import { createStore } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { createAnnotationsSlice } from "./slices/viewer.annotations.store";
import { createChannelsSlice } from "./slices/viewer.channels.store";
import { createCoreSlice } from "./slices/viewer.core.store";
import { createOverlaysSlice } from "./slices/viewer.overlays.store";
import { createViewSlice } from "./slices/viewer.view.store";
import type { ViewerStore } from "./types";
import { createMigrate } from "~/utils/persistMigration";

type PersistedViewerState = Pick<
  ViewerStore,
  "selectedChannelId" | "imagePanelIndex" | "imagePanels" | "layersStates" | "viewStateActive"
>;

const VIEWER_FALLBACK_STATE: PersistedViewerState = {
  selectedChannelId: null,
  imagePanelIndex: -1,
  imagePanels: [],
  layersStates: [],
  viewStateActive: null,
};

/**
 * Creates a Zustand store for one image-viewer instance. State + actions are
 * composed from domain slices (`slices/viewer.*.store.ts`) — core, view,
 * channels, overlays, annotations — over the `persist → immer → devtools`
 * middleware stack. Only `id` lives at the root; it keys persistence + devtools.
 */
export const createViewerStore = (id: string) =>
  createStore<ViewerStore>()(
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
        migrate: createMigrate<PersistedViewerState>(
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
            // C-149: resourceId format changed from provider/bucket/path to
            // connectionName/path. Clear persisted overlay keys — they'll be
            // re-added on next use.
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
          },
          VIEWER_FALLBACK_STATE,
        ),
        partialize: (state) => ({
          selectedChannelId: state.selectedChannelId,
          imagePanelIndex: state.imagePanelIndex,
          imagePanels: state.imagePanels,
          layersStates: state.layersStates,
          viewStateActive: state.viewStateActive,
        }),
        onRehydrateStorage: () => (_state, error) => {
          if (error) {
            console.error(`[ViewerStore-${id}] Rehydration failed:`, error);
          }
        },
      },
    ),
  );
