import type { PickingInfo } from "@deck.gl/core";
import { useCallback, useEffect, useRef } from "react";

import type { CanvasContentResult } from "./useCompositeHover";
import { useViewerStore, useViewerStoreApi } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";

export interface UseCanvasClickInteractionProps {
  imagePanelId: number;
  /** Fresh pick + content at a click point (from `useCompositeHover`). */
  buildContent: (x: number, y: number) => CanvasContentResult;
}

/** Click on the canvas (view/inspect mode) selects every feature at the point —
 *  replacing the former top-most-only layer selection — and opens the popup
 *  with the full tooltip content. Draw modes are untouched: there, the click is
 *  the drawing gesture. Owns the popup dismissal lifecycle. */
export const useCanvasClickInteraction = ({
  imagePanelId,
  buildContent,
}: UseCanvasClickInteractionProps) => {
  const storeApi = useViewerStoreApi();
  const openPopup = useViewerStore(select.openPopup);
  const closePopup = useViewerStore(select.closePopup);
  const applyAnnotationSelection = useViewerStore((s) => s.applyAnnotationSelection);
  // Panel-scoped popup reference — also drives the dismissal listeners.
  const popup = useViewerStore((s) => (s.popup?.panelId === imagePanelId ? s.popup : null));
  const viewState = useViewerStore((s) => s.viewStateActive);
  const annotationMode = useViewerStore((s) => s.annotationMode);

  const onCanvasClick = useCallback(
    (info: PickingInfo, event?: { srcEvent?: Partial<MouseEvent> }) => {
      const state = storeApi.getState();
      if (state.annotationMode !== "view" && state.annotationMode !== "inspect") return;

      const { tooltip, annotations } = buildContent(info.x, info.y);

      if (state.annotationMode === "view") {
        const src = event?.srcEvent;
        const modifier = !!(src && (src.metaKey || src.ctrlKey || src.shiftKey));
        const ids = annotations.map((a) => a.feature.id).filter((id): id is string => !!id);

        if (ids.length === 0) {
          // A modifier click on feature-free pixels is a no-op.
          if (modifier) return;
          // Plain click: deselect; the popup below still opens with the
          // channel/overlay content at the point.
          applyAnnotationSelection([], { anchor: null });
        } else {
          // Top-most picked id seeds the sidebar's Shift-range anchor.
          applyAnnotationSelection(ids, { toggle: modifier, anchor: ids[0] });
        }
      }

      if (tooltip && Object.keys(tooltip.sections).length > 0) {
        openPopup({
          panelId: imagePanelId,
          anchor: { x: info.x, y: info.y },
          sections: tooltip.sections,
          annotationRefs: annotations.map(({ feature, setId }) => ({
            id: feature.id as string,
            setId,
          })),
        });
      } else {
        closePopup();
      }
    },
    [storeApi, buildContent, imagePanelId, openPopup, closePopup, applyAnnotationSelection],
  );

  // Popup dismissal: Escape (capture), pointer-down outside the popup (a click
  // on this panel's canvas is excluded — the deck click that follows replaces
  // the popup at the new point).
  useEffect(() => {
    if (!popup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      closePopup();
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (typeof target.closest === "function" && target.closest("[data-image-popup]")) return;
      if (target.tagName === "CANVAS") return;
      closePopup();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
      // Non-interactive closes (stale-guard, pan, outside click) drop focus
      // from the popup to <body> — hand it back to where the user was.
      const active = document.activeElement as HTMLElement | null;
      if (
        (active === document.body || active?.closest("[data-image-popup]")) &&
        previouslyFocused
      ) {
        previouslyFocused.focus();
      }
    };
  }, [popup, closePopup]);

  // Pan/zoom invalidates the snapshot anchor/content — dismiss (cheap v1
  // choice; following the coordinate would re-pick on every frame). Skip the
  // popup-open transition itself: only a view-state change *after* opening
  // dismisses.
  const viewStateAtOpen = useRef(viewState);
  useEffect(() => {
    if (!popup) {
      viewStateAtOpen.current = viewState;
      return;
    }
    if (viewStateAtOpen.current !== viewState) {
      viewStateAtOpen.current = viewState;
      closePopup();
    }
  }, [viewState, popup, closePopup]);

  // Switching into a draw mode: the popup's point is no longer meaningful.
  useEffect(() => {
    if (popup && annotationMode !== "view" && annotationMode !== "inspect") closePopup();
  }, [annotationMode, popup, closePopup]);

  return { onCanvasClick };
};
