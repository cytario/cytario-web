import type { AnnotationMode, RGB, ViewerSlice } from "../types";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

/** Group name for features without a classification. */
export const UNCLASSIFIED = "Unclassified";

/** A feature's classification name, or the `Unclassified` fallback. Shared by
 *  the list grouping and the layer's visibility check so they agree on keys. */
export const classNameOf = (feature: AnnotationFeature): string =>
  feature.properties?.classification?.name ?? UNCLASSIFIED;

export interface AnnotationsSlice {
  annotationFeatures: AnnotationFeature[];
  annotationMode: AnnotationMode;
  /** `properties.id`s of selected features — stable across edits/reorders,
   *  unlike array indexes. Resolved to deck `selectedFeatureIndexes` at render. */
  annotationSelectedIds: string[];
  annotationOpacity: number;
  /** Classification names whose features are hidden — view-only, not persisted. */
  annotationHiddenClasses: string[];
  /** Keycloak `sub` owning the editable set — gates the autosave writer. */
  annotationOwnerId: string | null;
  /** Whether this user's sidecar exists on S3. Gates lazy-create (no empty
   *  file until the first real annotation) and persists across the seed → edit
   *  handoff. Shared by seed + the autosave writer. */
  annotationSidecarExists: boolean;
  /** Set by a user edit, cleared once persisted — gates the autosave writer. */
  annotationsDirty: boolean;

  /** Replace annotation features from a user edit — marks dirty (→ autosave). */
  setAnnotationFeatures: (features: AnnotationFeature[]) => void;
  setAnnotationOpacity: (opacity: number) => void;
  /** Show/hide every feature of a classification (display only). */
  toggleAnnotationClassVisibility: (name: string) => void;
  /** Recolor every feature of a classification — marks dirty (→ autosave). */
  setAnnotationClassColor: (name: string, color: RGB) => void;
  /** Replace annotation features from the S3 seed — does not mark dirty. */
  seedAnnotationFeatures: (features: AnnotationFeature[]) => void;
  setAnnotationMode: (mode: AnnotationMode) => void;
  setAnnotationSelectedIds: (ids: string[]) => void;
  /** Identify who owns the editable set (their sidecar is the write target). */
  setAnnotationOwner: (userId: string) => void;
  /** Record a successful persist: the sidecar now exists and the set is clean. */
  markAnnotationsSaved: () => void;
}

/** Per-image editable annotation state (features live on S3, never persisted). */
export const createAnnotationsSlice: ViewerSlice<AnnotationsSlice> = (set) => ({
  annotationFeatures: [],
  annotationMode: "view",
  annotationSelectedIds: [],
  annotationOpacity: 1,
  annotationHiddenClasses: [],
  annotationOwnerId: null,
  annotationSidecarExists: false,
  annotationsDirty: false,

  setAnnotationFeatures: (features) =>
    set(
      (state) => {
        state.annotationFeatures = features;
        state.annotationsDirty = true;
      },
      false,
      "setAnnotationFeatures",
    ),

  toggleAnnotationClassVisibility: (name) =>
    set(
      (state) => {
        const hidden = state.annotationHiddenClasses;
        const index = hidden.indexOf(name);
        if (index === -1) hidden.push(name);
        else hidden.splice(index, 1);
      },
      false,
      "toggleAnnotationClassVisibility",
    ),

  setAnnotationClassColor: (name, color) =>
    set(
      (state) => {
        let changed = false;
        for (const feature of state.annotationFeatures) {
          if (feature.properties?.classification?.name === name) {
            feature.properties.classification.color = color;
            changed = true;
          }
        }
        if (changed) state.annotationsDirty = true;
      },
      false,
      "setAnnotationClassColor",
    ),

  setAnnotationOpacity: (opacity) =>
    set(
      (state) => {
        state.annotationOpacity = opacity;
      },
      false,
      "setAnnotationOpacity",
    ),

  seedAnnotationFeatures: (features) =>
    set(
      (state) => {
        state.annotationFeatures = features;
        state.annotationsDirty = false;
        state.annotationSidecarExists = features.length > 0; // non-empty seed ⇒ sidecar exists
      },
      false,
      "seedAnnotationFeatures",
    ),

  setAnnotationOwner: (userId) =>
    set(
      (state) => {
        state.annotationOwnerId = userId;
      },
      false,
      "setAnnotationOwner",
    ),

  markAnnotationsSaved: () =>
    set(
      (state) => {
        state.annotationSidecarExists = true;
        state.annotationsDirty = false;
      },
      false,
      "markAnnotationsSaved",
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
