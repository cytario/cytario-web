import type { ZundoOptions } from "zundo";

import type { AnnotationClass } from "./slices/viewer.annotations.store";
import type { ViewerStore } from "./types";
import type { AnnotationsByUser } from "~/utils/db/getAnnotationsWasm";

/**
 * The slice of viewer state tracked in the undo/redo history. Only the
 * annotation data that a user can meaningfully undo — own-set features and
 * the class registry — enters the temporal store. Ephemeral view state
 * (draw mode, selection, opacity, hidden classes) is deliberately excluded:
 * undoing a classification change must not reset the user's draw mode or
 * panel selection. Peer sets (`annotationsByUser[otherUserId]`) are included
 * in the partialized map but, since the user never mutates them directly,
 * their refs never change → the equality check skips them at zero cost.
 */
export type TemporalPartial = {
  annotationsByUser: AnnotationsByUser;
  annotationClasses: AnnotationClass[];
};

/**
 * Maximum number of past states retained. 50 is a deliberate balance: enough
 * to walk back through a typical editing session without flooding memory
 * (each snapshot is a shallow ref to the partialized map, not a deep clone —
 * immer preserves unchanged refs). Beyond 50 the oldest entry is dropped.
 */
export const HISTORY_LIMIT = 50;

/**
 * Trailing-edge cool-off for gesture grouping. When the user performs rapid,
 * continuous edits (e.g. dragging vertices, batch-classifying), only the first
 * state of the gesture is recorded; subsequent edits within this window are
 * skipped so one undo restores the pre-gesture state. Leading-edge, not
 * trailing: we record the *first* past state (pre-gesture) immediately and
 * suppress the rest, because zundo records the state *before* each set — the
 * first set's past state is the pre-gesture snapshot we want.
 */
export const GESTURE_DEBOUNCE_MS = 500;

/**
 * Shallow reference equality on the two tracked fields. Immer gives a fresh
 * ref only for the part of state that was actually mutated, so a no-op set
 * (e.g. `setAnnotationMode`, `setAnnotationsOpacity`, selection changes)
 * keeps the same `annotationsByUser` / `annotationClasses` refs → equality
 * returns true → zundo skips the snapshot entirely.
 */
const temporalEquality = (past: TemporalPartial, current: TemporalPartial): boolean =>
  past.annotationsByUser === current.annotationsByUser &&
  past.annotationClasses === current.annotationClasses;

export interface TemporalState {
  /** Clears the cool-off immediately (called before undo/redo). */
  resetCooldown: () => void;
}

/**
 * Build the zundo `ZundoOptions` and a companion `TemporalState` (cool-off
 * controller) for a single viewer store. The cool-off timer is per-store,
 * created once when the store is built.
 *
 * `handleSet` fires on every `set()` — including those from `undo()`/`redo()`
 * and `seedAnnotations()`. Those callers wrap themselves in `pause()`/
 * `resume()`, so zundo's `temporalHandleSet` returns early (isTracking=false)
 * and never reaches `handleSet`. By the time `handleSet` runs, it's a genuine
 * user edit → apply the gesture cool-off.
 */
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
      annotationsByUser: state.annotationsByUser,
      annotationClasses: state.annotationClasses,
    }),
    limit: HISTORY_LIMIT,
    equality: temporalEquality,
    handleSet: (record) => (pastState, replace, currentState, deltaState) => {
      // Only enter the gesture cool-off when the tracked state actually
      // changed.  Without this guard, any `set()` — including ephemeral
      // view-state updates (draw mode, selection, opacity) that leave
      // `annotationsByUser` / `annotationClasses` refs untouched — would
      // arm the 500 ms timer and silently swallow the next real edit.
      const trackedChanged =
        (pastState as TemporalPartial).annotationsByUser !==
          (currentState as TemporalPartial).annotationsByUser ||
        (pastState as TemporalPartial).annotationClasses !==
          (currentState as TemporalPartial).annotationClasses;
      if (!trackedChanged) return;
      if (inCooldown) {
        // Extend the cool-off window — the gesture is still going.
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          inCooldown = false;
          timer = null;
        }, GESTURE_DEBOUNCE_MS);
        return;
      }
      inCooldown = true;
      // `record` is the internal `_handleSet` which accepts the full
      // (pastState, replace, currentState, deltaState) tuple, even though
      // zundo types it as `StoreApi['setState']` (2 args). Cast to match
      // the runtime signature from the source.
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
