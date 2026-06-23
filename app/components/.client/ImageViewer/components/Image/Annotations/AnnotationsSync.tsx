import { useEffect } from "react";

import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { getAnnotationsWasm } from "~/utils/db/getAnnotationsWasm";

/**
 * Seeds the viewer store's annotation features from the current user's sidecar
 * and records them as the editable set's owner. Persistence (debounced autosave
 * + flush) lives on the store itself — see `attachAnnotationAutosave`, wired in
 * the viewer registry — so it survives image switches. Mounted once inside the
 * viewer; renders nothing.
 */
export function AnnotationsSync() {
  const resourceId = useViewerStore((s) => s.id);
  const userId = useCurrentUser()?.sub;
  const seed = useViewerStore((s) => s.seedAnnotationFeatures);
  const setOwner = useViewerStore((s) => s.setAnnotationOwner);

  useEffect(() => {
    if (!userId) return; // wait for the user — the editable set is their own sidecar
    let cancelled = false;
    setOwner(userId);
    getAnnotationsWasm(resourceId, userId)
      .then((seeded) => {
        if (!cancelled) seed(seeded);
      })
      .catch((error) => console.error("[annotations] failed to load:", error));
    return () => {
      cancelled = true;
    };
  }, [resourceId, userId, seed, setOwner]);

  return null;
}
