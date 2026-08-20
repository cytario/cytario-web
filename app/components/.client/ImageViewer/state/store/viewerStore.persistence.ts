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
  | "annotationsOpacity"
  | "showAnnotationOutline"
>;

const VIEWER_FALLBACK_STATE: PersistedViewerState = {
  selectedChannelId: null,
  imagePanelIndex: -1,
  imagePanels: [],
  layersStates: [],
  viewStateActive: null,
  annotationClasses: [],
  annotationActiveClass: null,
  annotationsOpacity: 1,
  showAnnotationOutline: true,
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
    // C-423: annotation opacity + outline toggle are now persisted, matching
    // the channels/overlays opacity controls (which were already persisted via
    // layersStates). Backfill defaults for stores saved before this change.
    2: (state) => {
      const s = state as Partial<PersistedViewerState>;
      return {
        ...s,
        annotationsOpacity: s.annotationsOpacity ?? 1,
        showAnnotationOutline: s.showAnnotationOutline ?? true,
      } as PersistedViewerState;
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
  // Section-level render toggles — persisted per image, matching the
  // channels/overlays opacity controls in layersStates.
  annotationsOpacity: state.annotationsOpacity,
  showAnnotationOutline: state.showAnnotationOutline,
});
