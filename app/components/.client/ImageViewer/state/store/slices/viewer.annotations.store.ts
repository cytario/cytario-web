import type { AnnotationMode, ViewerSlice } from "../types";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

export interface AnnotationsSlice {
  annotationFeatures: AnnotationFeature[];
  annotationMode: AnnotationMode;
  annotationSelectedIndexes: number[];
  annotationOpacity: number;
  annotationsDirty: boolean;

  /** Replace annotation features from a user edit — marks dirty (→ autosave). */
  setAnnotationFeatures: (features: AnnotationFeature[]) => void;
  setAnnotationOpacity: (opacity: number) => void;
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
