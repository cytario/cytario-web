import { useEffect, useRef } from "react";

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

  // Whether this user's sidecar exists on S3. Gates the autosave so an empty
  // working set never *creates* a file — the sidecar is born on the first
  // real annotation. Flips true once seeded non-empty or after a write, so
  // deleting the last annotation still clears the existing file.
  const fileExists = useRef(false);

  useEffect(() => {
    if (!userId) return; // wait for the user — the editable set is their own sidecar
    let cancelled = false;
    fileExists.current = false; // new image → unknown until this read resolves
    getAnnotationsWasm(resourceId, userId)
      .then((seeded) => {
        if (cancelled) return;
        if (seeded.length > 0) fileExists.current = true;
        seed(seeded);
      })
      .catch((error) => console.error("[annotations] failed to load:", error));
    return () => {
      cancelled = true;
    };
  }, [resourceId, userId, seed]);

  useEffect(() => {
    if (!dirty || !userId) return;
    if (features.length === 0 && !fileExists.current) return; // nothing to persist yet
    const timer = setTimeout(() => {
      writeAnnotations(resourceId, userId, features)
        .then(() => {
          fileExists.current = true;
        })
        .catch((error) => console.error("[annotations] failed to save:", error));
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [features, dirty, userId, resourceId]);

  return null;
}
