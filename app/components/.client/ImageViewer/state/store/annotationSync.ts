import type { createViewerStore } from "./createViewerStore";
import { toastBridge } from "~/toast-bridge";
import { deleteAnnotations } from "~/utils/db/deleteAnnotations";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";
import { readAllAnnotations } from "~/utils/db/getAnnotationsWasm";
import { writeAnnotations } from "~/utils/db/writeAnnotationsWasm";

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

const SAVE_DEBOUNCE_MS = 800;

/** Annotation ↔ S3 sync. One-time read seeds `annotationSets`; each change to
 *  a set's `features` array is diffed against the persisted baseline and the
 *  changed set's sidecar is written, debounced. A set present in the baseline
 *  but absent from the working copy was deleted — its sidecar file is DELETEd. */
export function attachAnnotationSync(store: ViewerStoreApi): void {
  interface PersistedSet {
    features: AnnotationFeature[];
    name: string | undefined;
  }
  let persisted: Record<string, PersistedSet> = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing = false;
  let saveFailed = false;
  let deleteFailed = false;

  readAllAnnotations(store.getState().id)
    .then((sets) => {
      const baseline: Record<string, PersistedSet> = {};
      for (const s of sets) baseline[s.id] = { features: s.features, name: s.name };
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
        const base = persisted[set.id];
        // A set diffs when its features array or its display name changed —
        // immer gives the mutated set a fresh reference for either.
        if (set.features === base?.features && set.name === base?.name) continue;
        const snapshot = set.features;
        const snapshotName = set.name;
        if (snapshot.length === 0 && base === undefined) continue;
        try {
          await writeAnnotations(id, set.id, set.createdBy, snapshot, snapshotName);
          const current = store.getState().annotationSets.find((s) => s.id === set.id);
          // Only advance the baseline if the set wasn't edited mid-flush.
          if (current?.features === snapshot && current?.name === snapshotName)
            persisted[set.id] = { features: snapshot, name: snapshotName };
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

      // Deleted sets: in the persisted baseline but gone from the working
      // copy → remove their sidecar files. A DELETE failure keeps the
      // baseline entry so it retries on the next flush.
      const currentIds = new Set(annotationSets.map((s) => s.id));
      for (const setId of Object.keys(persisted)) {
        if (currentIds.has(setId)) continue;
        try {
          await deleteAnnotations(id, setId);
          delete persisted[setId];
          deleteFailed = false;
        } catch (error) {
          console.error(`[annotations] delete failed for ${setId}:`, error);
          if (!deleteFailed) {
            deleteFailed = true;
            toastBridge.emit({
              variant: "error",
              message:
                "Annotation set could not be deleted — the sidecar file remains on S3 and the set will reappear on reload.",
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
