import type { createViewerStore } from "./createViewerStore";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";
import { readAllAnnotations } from "~/utils/db/getAnnotationsWasm";
import { writeAnnotations } from "~/utils/db/writeAnnotationsWasm";

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

const SAVE_DEBOUNCE_MS = 800;

/**
 * Annotation ↔ S3 sync, bound to the registry-cached (never-destroyed) viewer
 * store rather than a component, so a pending write survives image switches and
 * panel collapse. One-time read on attach seeds the per-user map and records the
 * persisted baseline; thereafter each change to `annotationsByUser` is diffed
 * per user — immer gives a fresh array ref only for the user that changed — and
 * the changed users' sidecars are written, debounced.
 *
 * No dirty flag: the baseline IS the change check. The store `id` is fixed for
 * the store's life (one store per image, keyed by resourceId), so a write can
 * never target a different image.
 */
export function attachAnnotationSync(store: ViewerStoreApi): void {
  // Last successfully-persisted features per user — the diff baseline. A key
  // present here means that user's sidecar exists on S3.
  let persisted: Record<string, AnnotationFeature[]> = {};
  let timer: ReturnType<typeof setTimeout> | null = null;

  // One-time read → seed. Setting the baseline to the SAME refs the seed installs
  // means the subscription fire it triggers diffs to zero — no write-back of what
  // was just read, which is the job the old dirty flag did.
  readAllAnnotations(store.getState().id)
    .then((byUser) => {
      persisted = { ...byUser };
      store.getState().seedAnnotations(byUser);
    })
    .catch((error) => console.error("[annotations] load failed:", error));

  const flush = async () => {
    timer = null;
    const { id, annotationsByUser } = store.getState();
    const changedUserIds = Object.keys(annotationsByUser).filter(
      (userId) => annotationsByUser[userId] !== persisted[userId],
    );

    for (const userId of changedUserIds) {
      const snapshot = annotationsByUser[userId];
      // Lazy-create: never write an empty file for a user who never had one.
      if (snapshot.length === 0 && persisted[userId] === undefined) continue;
      try {
        await writeAnnotations(id, userId, snapshot);
        // Advance the baseline only if no newer edit replaced this user's array
        // mid-write — otherwise that edit's own debounce will persist it.
        if (store.getState().annotationsByUser[userId] === snapshot) persisted[userId] = snapshot;
      } catch (error) {
        // Leave the baseline stale → retried on the next change. Peer writes 403
        // here until role-based edit-others + IAM land; the UI mutates only own.
        console.error(`[annotations] save failed for ${userId}:`, error);
      }
    }
  };

  // Fires on every map change (edits and the seed); the seed diffs to zero via
  // the baseline, so only real edits debounce a write.
  store.subscribe(
    (s) => s.annotationsByUser,
    () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
  );
}
