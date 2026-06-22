import type { createViewerStore } from "./createViewerStore";
import { writeAnnotations } from "~/utils/db/writeAnnotationsWasm";

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

const SAVE_DEBOUNCE_MS = 800;

/**
 * Attaches a debounced S3 autosave to a viewer store: subscribes to the
 * annotation feature set and writes the owner's sidecar once edits settle.
 *
 * Bound to the registry-cached (never-destroyed) store, not a component — so a
 * pending write survives image switches; the timer outlives any React lifecycle
 * and still fires in a backgrounded tab.
 */
export function attachAnnotationAutosave(store: ViewerStoreApi): void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const write = async () => {
    timer = null;
    const { id, annotationOwnerId, annotationFeatures, annotationsDirty, annotationSidecarExists } =
      store.getState();
    if (!annotationsDirty || !annotationOwnerId) return;
    if (annotationFeatures.length === 0 && !annotationSidecarExists) return; // lazy-create

    const snapshot = annotationFeatures;
    try {
      await writeAnnotations(id, annotationOwnerId, snapshot);
      // Skip if a newer edit replaced the array mid-write — its own debounce persists it.
      if (store.getState().annotationFeatures === snapshot) store.getState().markAnnotationsSaved();
    } catch (error) {
      console.error("[annotations] save failed:", error); // leave dirty → retried on next edit
    }
  };

  // Fires on every feature-set change (edits and seed); the seed no-ops in
  // `write` via the dirty gate, so only user edits debounce a write.
  store.subscribe(
    (s) => s.annotationFeatures,
    () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void write(), SAVE_DEBOUNCE_MS);
    },
  );
}
