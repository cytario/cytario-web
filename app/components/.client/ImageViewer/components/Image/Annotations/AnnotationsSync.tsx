import { useEffect } from "react";

import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { getAnnotationsWasm } from "~/utils/db/getAnnotationsWasm";
import { writeAnnotations } from "~/utils/db/writeAnnotationsWasm";

const SAVE_DEBOUNCE_MS = 800;

/**
 * Seeds the viewer store's annotation features from the user's sidecar and
 * autosaves edits (debounced) back to it. The `annotationsDirty` flag separates
 * the S3 seed from user edits so loading never triggers a write. Mounted once
 * inside the viewer; renders nothing.
 */
export function AnnotationsSync() {
  const resourceId = useViewerStore((s) => s.id);
  const userId = useCurrentUser()?.sub;
  const features = useViewerStore((s) => s.annotationFeatures);
  const dirty = useViewerStore((s) => s.annotationsDirty);
  const seed = useViewerStore((s) => s.seedAnnotationFeatures);

  useEffect(() => {
    if (!userId) return; // wait for the user — the editable set is their own sidecar
    let cancelled = false;
    getAnnotationsWasm(resourceId, userId)
      .then((seeded) => {
        if (!cancelled) seed(seeded);
      })
      .catch((error) => console.error("[annotations] failed to load:", error));
    return () => {
      cancelled = true;
    };
  }, [resourceId, userId, seed]);

  useEffect(() => {
    if (!dirty || !userId) return;
    const timer = setTimeout(() => {
      writeAnnotations(resourceId, userId, features).catch((error) =>
        console.error("[annotations] failed to save:", error),
      );
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [features, dirty, userId, resourceId]);

  return null;
}
