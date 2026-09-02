import type { createViewerStore } from "./createViewerStore";
import { toastBridge } from "~/toast-bridge";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";
import { readAllAnnotations } from "~/utils/db/getAnnotationsWasm";
import { writeAnnotations } from "~/utils/db/writeAnnotationsWasm";

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

const SAVE_DEBOUNCE_MS = 800;

/** Annotation ↔ S3 sync. One-time read seeds `annotationSets`; each change to
 *  a set's `features` array is diffed against the persisted baseline and the
 *  changed set's sidecar is written, debounced. */
export function attachAnnotationSync(store: ViewerStoreApi): void {
  let persisted: Record<string, AnnotationFeature[]> = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing = false;
  let saveFailed = false;

  readAllAnnotations(store.getState().id)
    .then((sets) => {
      const baseline: Record<string, AnnotationFeature[]> = {};
      for (const s of sets) baseline[s.id] = s.features;
      persisted = baseline;
      store.getState().seedAnnotations(sets);
    })
    .catch((error) => console.error("[annotations] load failed:", error));

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  };

  const flush = async () => {
    timer = null;
    if (flushing) return schedule();
    flushing = true;
    try {
      const { id, annotationSets } = store.getState();
      for (const set of annotationSets) {
        if (set.features === persisted[set.id]) continue;
        const snapshot = set.features;
        if (snapshot.length === 0 && persisted[set.id] === undefined) continue;
        try {
          await writeAnnotations(id, set.id, set.createdBy, snapshot);
          if (store.getState().annotationSets.find((s) => s.id === set.id)?.features === snapshot)
            persisted[set.id] = snapshot;
          saveFailed = false;
        } catch (error) {
          console.error(`[annotations] save failed for ${set.id}:`, error);
          // One toast per failure streak — the baseline stays stale so the
          // change retries on the next edit; toasting every flush would spam.
          if (!saveFailed) {
            saveFailed = true;
            toastBridge.emit({
              variant: "error",
              message:
                "Annotation save failed — your changes are not persisted (check your connection's write access).",
            });
          }
        }
      }
    } finally {
      flushing = false;
    }
  };

  store.subscribe((s) => s.annotationSets, schedule);
}
