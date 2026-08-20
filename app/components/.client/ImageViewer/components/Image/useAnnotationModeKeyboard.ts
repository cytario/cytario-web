import { useContext, useEffect, useRef } from "react";

import { AnnotationMode } from "../../state/store/types";
import { ViewerStoreContext } from "../../state/store/ViewerStoreContext";

const DRAW_MODES: ReadonlySet<AnnotationMode> = new Set([
  "draw-polygon",
  "draw-freehand",
  "draw-point",
]);

/**
 * Global keyboard shortcuts for annotation modes:
 *
 * - **Escape** — return to the default drag/pan/zoom ("view") mode.
 * - **Space (hold)** — temporarily enter drag mode while held; on release the
 *   previous annotation mode is restored.  Lets the user pan the canvas without
 *   abandoning the active draw tool, mirroring the convention in every major
 *   graphics editor.
 *
 * The hook is scoped to the image viewer; key events that originate from form
 * controls (input, textarea, contenteditable) are ignored so the space bar
 * still works in search inputs and rename fields.
 */
export function useAnnotationModeKeyboard() {
  const store = useContext(ViewerStoreContext);
  if (!store) throw new Error("useAnnotationModeKeyboard must be used within ViewerStoreProvider");

  const savedMode = useRef<AnnotationMode | null>(null);
  const spaceDown = useRef(false);

  useEffect(() => {
    const isFormField = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isFormField(e.target)) return;

      if (e.key === "Escape") {
        const current = store.getState().annotationMode;
        if (current !== "view") {
          store.getState().setAnnotationMode("view");
        }
        return;
      }

      if (e.code === "Space") {
        if (e.repeat) return;
        if (spaceDown.current) return;
        spaceDown.current = true;
        e.preventDefault();
        const current = store.getState().annotationMode;
        if (DRAW_MODES.has(current)) {
          savedMode.current = current;
          store.getState().setAnnotationMode("view");
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDown.current = false;
        const saved = savedMode.current;
        savedMode.current = null;
        // Only restore if the mode is still "view" — if the user changed
        // modes while Space was held (e.g. clicked a toolbar button), the
        // savedMode is stale and must not be restored (C2-1).
        if (saved && store.getState().annotationMode === "view") {
          store.getState().setAnnotationMode(saved);
        }
      }
    };

    const onBlur = () => {
      // If Space was held when the window lost focus, restore the saved
      // mode so the user doesn't get stuck in "view" (C2-3).
      if (spaceDown.current) {
        spaceDown.current = false;
        const saved = savedMode.current;
        savedMode.current = null;
        if (saved && store.getState().annotationMode === "view") {
          store.getState().setAnnotationMode(saved);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", onBlur);
    };
  }, [store]);
}
