import { useContext, useEffect, useRef } from "react";

import { ViewerStoreContext } from "../../state/store/core/ViewerStoreContext";
import { useCanAnnotate } from "../../utils/useCanAnnotate";
import { isInsideFloatingPanel } from "~/components/Sidebar/SidebarContext";
import type { AnnotationFeature } from "~/utils/db/annotationSchema";

/** Paste offset per step: a fraction of the current view's slide-coordinate
 *  extent, so the duplicate is visibly clear of its source at any zoom. */
const PASTE_OFFSET_FRACTION = 0.025;

/** Global annotation-clipboard shortcuts (SRS-CY-33327): Cmd/Ctrl+C copies the
 *  selection, Cmd/Ctrl+V pastes an offset duplicate, Cmd/Ctrl+D duplicates in
 *  place. Suppressed while typing in a form field, while a floating panel holds
 *  focus, and on read-only connections (no authoring — SRS-CY-33286). */
export function useAnnotationDuplicateShortcuts() {
  const store = useContext(ViewerStoreContext);
  const canAnnotate = useCanAnnotate();
  if (!store)
    throw new Error("useAnnotationDuplicateShortcuts must be used within ViewerStoreProvider");

  const clipboard = useRef<AnnotationFeature[]>([]);
  const pasteCount = useRef(0);

  useEffect(() => {
    if (!canAnnotate) return;

    const isFormField = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
    };

    const selectedSources = (): AnnotationFeature[] => {
      const state = store.getState();
      const activeSet = state.annotationSets.find((s) => s.id === state.activeSetId);
      if (!activeSet) return [];
      const selected = new Set(state.annotationSelectedIds);
      // V1 duplicates only the active own set's features; peer-selected ids
      // are skipped (peer copies raise an authorship question tracked on C-513).
      return activeSet.features.filter((f) => f.id && selected.has(f.id));
    };

    const pasteOffset = (steps: number): [number, number] | undefined => {
      const viewState = store.getState().viewStateActive;
      if (!viewState) return undefined;
      // Orthographic zoom: world units per pixel = 2^-zoom.
      const worldPerPixel = Math.pow(2, -viewState.zoom);
      const extent = Math.min(viewState.width, viewState.height) * worldPerPixel;
      const delta = extent * PASTE_OFFSET_FRACTION * steps;
      return [delta, delta];
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.repeat) return;
      if (isFormField(e.target)) return;
      if (isInsideFloatingPanel(document.activeElement)) return;

      const key = e.key.toLowerCase();
      if (key !== "c" && key !== "v" && key !== "d") return;
      // A live text selection (e.g. a sidebar label) owns Cmd/Ctrl+C — the
      // browser copy wins over the annotation clipboard.
      if (key === "c" && (document.getSelection()?.toString().length ?? 0) > 0) return;
      e.preventDefault();

      const state = store.getState();
      if (key === "c") {
        clipboard.current = selectedSources();
        pasteCount.current = 0;
        return;
      }

      const activeSetId = state.activeSetId;
      if (!activeSetId) return;

      if (key === "v") {
        if (clipboard.current.length === 0) return;
        pasteCount.current += 1;
        state.duplicateAnnotations(activeSetId, clipboard.current, pasteOffset(pasteCount.current));
        return;
      }

      // Cmd/Ctrl+D: duplicate the current selection in place and refresh the
      // clipboard to the new selection so D followed by V chains naturally.
      const sources = selectedSources();
      if (sources.length === 0) return;
      const ids = state.duplicateAnnotations(activeSetId, sources);
      clipboard.current = [];
      const activeSet = store.getState().annotationSets.find((s) => s.id === activeSetId);
      if (activeSet) {
        clipboard.current = activeSet.features.filter((f) => ids.includes(f.id));
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [store, canAnnotate]);
}
