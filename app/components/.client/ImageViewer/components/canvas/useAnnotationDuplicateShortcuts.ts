import { useContext, useEffect } from "react";

import { ViewerStoreContext } from "../../state/store/core/ViewerStoreContext";
import { useCanAnnotate } from "../../utils/useCanAnnotate";
import { isInsideFloatingPanel } from "~/components/Sidebar/SidebarContext";

/** Global duplicate shortcut (SRS-CY-33327): Cmd/Ctrl+D duplicates the current
 *  annotation selection in place. Suppressed while typing in a form field,
 *  while a floating panel holds focus, and on read-only connections
 *  (no authoring — SRS-CY-33286). */
export function useAnnotationDuplicateShortcuts() {
  const store = useContext(ViewerStoreContext);
  const canAnnotate = useCanAnnotate();
  if (!store)
    throw new Error("useAnnotationDuplicateShortcuts must be used within ViewerStoreProvider");

  useEffect(() => {
    if (!canAnnotate) return;

    const isFormField = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.repeat) return;
      if (isFormField(e.target)) return;
      if (isInsideFloatingPanel(document.activeElement)) return;
      if (e.key.toLowerCase() !== "d") return;
      e.preventDefault();

      const state = store.getState();
      const activeSetId = state.activeSetId;
      if (!activeSetId) return;
      const activeSet = state.annotationSets.find((s) => s.id === activeSetId);
      if (!activeSet) return;
      const selected = new Set(state.annotationSelectedIds);
      // V1 duplicates only the active own set's features; peer-selected ids
      // are skipped (peer copies raise an authorship question tracked on C-513).
      const sources = activeSet.features.filter((f) => f.id && selected.has(f.id));
      if (sources.length === 0) return;
      state.duplicateAnnotations(activeSetId, sources);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [store, canAnnotate]);
}
