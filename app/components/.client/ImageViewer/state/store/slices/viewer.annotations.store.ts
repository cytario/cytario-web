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
  annotationSelectedIndexes: number[];
  annotationOpacity: number;
  /** Classification names whose features are hidden — view-only, not persisted. */
  annotationHiddenClasses: string[];
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
  setAnnotationSelectedIndexes: (indexes: number[]) => void;
}

/** Per-image editable annotation state (features live on S3, never persisted). */
export const createAnnotationsSlice: ViewerSlice<AnnotationsSlice> = (set) => ({
  annotationFeatures: [],
  annotationMode: "view",
  annotationSelectedIndexes: [],
  annotationOpacity: 1,
  annotationHiddenClasses: [],
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
      },
      false,
      "seedAnnotationFeatures",
    ),

  setAnnotationMode: (mode) =>
    set(
      (state) => {
        state.annotationMode = mode;
      },
      false,
      "setAnnotationMode",
    ),

  setAnnotationSelectedIndexes: (indexes) =>
    set(
      (state) => {
        state.annotationSelectedIndexes = indexes;
      },
      false,
      "setAnnotationSelectedIndexes",
    ),
});
