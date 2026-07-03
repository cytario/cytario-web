import { ViewerStore } from "./types";
import { createMigrate } from "~/utils/persistMigration";

/** The subset of viewer state persisted to localStorage — the single source of
 *  truth for both the migrate fallback and `createViewerStore`'s `partialize`. */
type PersistedViewerState = Pick<
  ViewerStore,
  | "selectedChannelId"
  | "imagePanelIndex"
  | "imagePanels"
  | "layersStates"
  | "viewStateActive"
  | "annotationClasses"
  | "annotationActiveClass"
>;

const VIEWER_FALLBACK_STATE: PersistedViewerState = {
  selectedChannelId: null,
  imagePanelIndex: -1,
  imagePanels: [],
  layersStates: [],
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
);

export const viewerStorePartialize = (state: ViewerStore): PersistedViewerState => ({
  selectedChannelId: state.selectedChannelId,
  imagePanelIndex: state.imagePanelIndex,
  imagePanels: state.imagePanels,
  layersStates: state.layersStates,
  viewStateActive: state.viewStateActive,
  // Per-image class registry + active class — browser-persisted for now; a
  // "settings" sidecar is the eventual home.
  annotationClasses: state.annotationClasses,
  annotationActiveClass: state.annotationActiveClass,
});
