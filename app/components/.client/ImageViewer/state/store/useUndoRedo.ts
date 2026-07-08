import { useCallback, useContext, useSyncExternalStore } from "react";

import { ViewerStoreContext } from "./ViewerStoreContext";

type TemporalState = {
  pastStates: unknown[];
  futureStates: unknown[];
  undo: () => void;
  redo: () => void;
  pause: () => void;
  resume: () => void;
};

type TemporalStoreApi = import("zustand").StoreApi<TemporalState>;

/**
 * Exposes undo/redo for the current viewer's annotation history.
 *
 * zundo's `undo()`/`redo()` apply a past/future state by calling the store's
 * `set()` — which would normally flow back through `handleSet` and record a
 * new history entry. To prevent that, each call wraps `undo()`/`redo()` in
 * `pause()`/`resume()` on the temporal store so the reapplication is not
 * tracked. The gesture cool-off is also reset before the call so the first
 * post-undo edit is always recorded.
 *
 * `canUndo` / `canRedo` are derived from the temporal store's `pastStates` /
 * `futureStates` lengths and stay reactive via a temporal-store subscription.
 */
export const useUndoRedo = () => {
  const store = useContext(ViewerStoreContext);
  if (!store) throw new Error("useUndoRedo must be used within ViewerStoreProvider");

  const temporalStore = (store as unknown as { temporal?: TemporalStoreApi }).temporal;

  const cooldownReset = (store as unknown as { __temporalState?: { resetCooldown: () => void } })
    ?.__temporalState?.resetCooldown;

  const canUndo = useSyncExternalStore(
    temporalStore?.subscribe ?? (() => () => {}),
    () => (temporalStore?.getState().pastStates.length ?? 0) > 0,
    () => false,
  );
  const canRedo = useSyncExternalStore(
    temporalStore?.subscribe ?? (() => () => {}),
    () => (temporalStore?.getState().futureStates.length ?? 0) > 0,
    () => false,
  );

  const undo = useCallback(() => {
    if (!temporalStore) return;
    cooldownReset?.();
    const t = temporalStore.getState();
    if (t.pastStates.length === 0) return;
    t.pause();
    try {
      t.undo();
    } finally {
      t.resume();
    }
  }, [temporalStore, cooldownReset]);

  const redo = useCallback(() => {
    if (!temporalStore) return;
    cooldownReset?.();
    const t = temporalStore.getState();
    if (t.futureStates.length === 0) return;
    t.pause();
    try {
      t.redo();
    } finally {
      t.resume();
    }
  }, [temporalStore, cooldownReset]);

  return { undo, redo, canUndo, canRedo };
};
