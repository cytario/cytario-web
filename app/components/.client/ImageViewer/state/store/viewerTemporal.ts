import type { ZundoOptions } from "zundo";

import type { AnnotationClass } from "./slices/viewer.annotations.store";
import type { ViewerStore } from "./types";
import type { AnnotationSet } from "~/utils/db/getAnnotationsWasm";

export type TemporalPartial = {
  annotationSets: AnnotationSet[];
  annotationClasses: AnnotationClass[];
};

export const HISTORY_LIMIT = 50;
export const GESTURE_DEBOUNCE_MS = 500;

const temporalEquality = (past: TemporalPartial, current: TemporalPartial): boolean =>
  past.annotationSets === current.annotationSets &&
  past.annotationClasses === current.annotationClasses;

export interface TemporalState {
  resetCooldown: () => void;
}

export function createTemporalOptions(): {
  options: ZundoOptions<ViewerStore, TemporalPartial>;
  temporalState: TemporalState;
} {
  let inCooldown = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const resetCooldown = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    inCooldown = false;
  };

  const options: ZundoOptions<ViewerStore, TemporalPartial> = {
    partialize: (state): TemporalPartial => ({
      annotationSets: state.annotationSets,
      annotationClasses: state.annotationClasses,
    }),
    limit: HISTORY_LIMIT,
    equality: temporalEquality,
    handleSet: (record) => (pastState, replace, currentState, deltaState) => {
      const trackedChanged =
        (pastState as TemporalPartial).annotationSets !==
          (currentState as TemporalPartial).annotationSets ||
        (pastState as TemporalPartial).annotationClasses !==
          (currentState as TemporalPartial).annotationClasses;
      if (!trackedChanged) return;
      if (inCooldown) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          inCooldown = false;
          timer = null;
        }, GESTURE_DEBOUNCE_MS);
        return;
      }
      inCooldown = true;
      (record as (...args: unknown[]) => void)(pastState, replace, currentState, deltaState);
      timer = setTimeout(() => {
        inCooldown = false;
        timer = null;
      }, GESTURE_DEBOUNCE_MS);
    },
  };

  return {
    options,
    temporalState: { resetCooldown },
  };
}
