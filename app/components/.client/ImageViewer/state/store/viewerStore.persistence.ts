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
  | "channels"
  | "channelIds"
  | "viewStateActive"
  | "annotationClasses"
  | "annotationActiveClass"
>;

const VIEWER_FALLBACK_STATE: PersistedViewerState = {
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
    // C-423 follow-up: annotationsOpacity and showAnnotationOutline moved from
    // top-level persisted state into per-preset layersStates entries (mirroring
    // channelsOpacity/showCellOutline). Migrate the old top-level values into
    // every existing layersStates entry; entries created after this change
    // already include the fields via addChannelsState.
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
    // C-559: contrastLimitsInitial removed from ChannelConfig; reset target is
    // now the top-level `channels` (persisted separately). Old persisted state
    // has stale shape — just clear it; the viewer reinitializes from metadata.
    4: () => VIEWER_FALLBACK_STATE,
  },
  VIEWER_FALLBACK_STATE,
);

export const viewerStorePartialize = (state: ViewerStore): PersistedViewerState => ({
  selectedChannelId: state.selectedChannelId,
  imagePanelIndex: state.imagePanelIndex,
  imagePanels: state.imagePanels,
  layersStates: state.layersStates,
  channels: state.channels,
  channelIds: state.channelIds,
  viewStateActive: state.viewStateActive,
  // Per-image class registry + active class — browser-persisted for now; a
  // "settings" sidecar is the eventual home.
  annotationClasses: state.annotationClasses,
  annotationActiveClass: state.annotationActiveClass,
});
