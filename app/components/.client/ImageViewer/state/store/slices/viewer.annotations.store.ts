import type { AnnotationMode, RGB, ViewerSlice, ViewerStore } from "../types";
import type { AnnotationFeature, AnnotationsByUser } from "~/utils/db/getAnnotationsWasm";

/** Group name for features without a classification. */
export const UNCLASSIFIED = "Unclassified";

/** Fallback color for features/groups without a classification — a neutral gray,
 *  shared by the canvas layer, the group-row dot, and the sidebar thumbnail so
 *  "Unclassified" looks identical everywhere. */
export const UNCLASSIFIED_COLOR: RGB = [120, 120, 120];

/** A feature's classification name, or the `Unclassified` fallback. Shared by
 *  the list grouping and the layer's visibility check so they agree on keys. */
export const classNameOf = (feature: AnnotationFeature): string =>
  feature.properties?.classification?.name ?? UNCLASSIFIED;

/** Per-user view state — ephemeral, never persisted (lives apart from the
 *  S3-backed `annotationsByUser` so a view change can't trigger a sidecar write). */
export interface UserAnnotationView {
  opacity: number;
  /** Classification names hidden for THIS user's set (per-user, not global). */
  hiddenClasses: string[];
}

/** Stable empty references so selectors never return a fresh value (zustand
 *  compares with `Object.is` — a new array each call loops renders). Read-only
 *  by convention; never mutated. */
const NO_FEATURES: AnnotationFeature[] = [];
const NO_HIDDEN: string[] = [];

/** A single user's feature set from the map (or a stable empty array). */
export const selectUserFeatures =
  (userId: string | undefined) =>
  (state: ViewerStore): AnnotationFeature[] =>
    (userId && state.annotationsByUser[userId]) || NO_FEATURES;

/** A single user's layer opacity (defaults to fully opaque). */
export const selectUserOpacity =
  (userId: string | undefined) =>
  (state: ViewerStore): number =>
    (userId ? state.annotationView[userId]?.opacity : undefined) ?? 1;

/** A single user's hidden classification names (stable empty array by default). */
export const selectUserHiddenClasses =
  (userId: string | undefined) =>
  (state: ViewerStore): string[] =>
    (userId ? state.annotationView[userId]?.hiddenClasses : undefined) ?? NO_HIDDEN;

export interface AnnotationsSlice {
  /** Every user's annotations, keyed by Keycloak `sub` — the single source of
   *  truth. Own is just `annotationsByUser[ownSub]`; no own/peer split is stored.
   *  Edit-others (future, role-gated) writes another key, same as own. */
  annotationsByUser: AnnotationsByUser;
  annotationMode: AnnotationMode;
  /** `properties.id`s of selected features — stable across edits/reorders,
   *  unlike array indexes. Resolved to deck `selectedFeatureIndexes` at render. */
  annotationSelectedIds: string[];
  /** Per-user view state (opacity, hidden classes), keyed by `sub`. Kept apart
   *  from `annotationsByUser` so a view change never enters the persist diff. */
  annotationView: Record<string, UserAnnotationView>;

  /** Install the per-user map from the one-time S3 read. The sync middleware
   *  sets its persisted baseline to the same refs first, so this no-ops the
   *  resulting diff (no write-back of what was just read). */
  seedAnnotations: (byUser: AnnotationsByUser) => void;
  /** Replace one user's features (draw/move/delete). Immer gives that key a
   *  fresh array ref, which the sync middleware diffs → writes that sidecar. */
  updateUserFeatures: (userId: string, features: AnnotationFeature[]) => void;
  /** Recolor every feature of a classification within one user's set. */
  setAnnotationClassColor: (userId: string, name: string, color: RGB) => void;
  /** Set one user's layer opacity. */
  setAnnotationOpacity: (userId: string, opacity: number) => void;
  /** Show/hide a classification within ONE user's set (display only). */
  toggleAnnotationClassVisibility: (userId: string, name: string) => void;
  setAnnotationMode: (mode: AnnotationMode) => void;
  setAnnotationSelectedIds: (ids: string[]) => void;
}

/** Per-image annotation state. Features live on S3 (one sidecar per user); this
 *  slice holds the working copy + view state. Persistence is the sync middleware
 *  (`attachAnnotationSync`), bound to the store — never serialized here. */
export const createAnnotationsSlice: ViewerSlice<AnnotationsSlice> = (set) => ({
  annotationsByUser: {},
  annotationMode: "view",
  annotationSelectedIds: [],
  annotationView: {},

  seedAnnotations: (byUser) =>
    set(
      (state) => {
        state.annotationsByUser = byUser;
      },
      false,
      "seedAnnotations",
    ),

  updateUserFeatures: (userId, features) =>
    set(
      (state) => {
        state.annotationsByUser[userId] = features;
      },
      false,
      "updateUserFeatures",
    ),

  setAnnotationClassColor: (userId, name, color) =>
    set(
      (state) => {
        const features = state.annotationsByUser[userId];
        if (!features) return;
        for (const feature of features) {
          if (feature.properties?.classification?.name === name) {
            feature.properties.classification.color = color;
          }
        }
      },
      false,
      "setAnnotationClassColor",
    ),

  toggleAnnotationClassVisibility: (userId, name) =>
    set(
      (state) => {
        const view = (state.annotationView[userId] ??= { opacity: 1, hiddenClasses: [] });
        const index = view.hiddenClasses.indexOf(name);
        if (index === -1) view.hiddenClasses.push(name);
        else view.hiddenClasses.splice(index, 1);
      },
      false,
      "toggleAnnotationClassVisibility",
    ),

  setAnnotationOpacity: (userId, opacity) =>
    set(
      (state) => {
        const view = (state.annotationView[userId] ??= { opacity: 1, hiddenClasses: [] });
        view.opacity = opacity;
      },
      false,
      "setAnnotationOpacity",
    ),

  setAnnotationMode: (mode) =>
    set(
      (state) => {
        state.annotationMode = mode;
      },
      false,
      "setAnnotationMode",
    ),

  setAnnotationSelectedIds: (ids) =>
    set(
      (state) => {
        state.annotationSelectedIds = ids;
      },
      false,
      "setAnnotationSelectedIds",
    ),
});
