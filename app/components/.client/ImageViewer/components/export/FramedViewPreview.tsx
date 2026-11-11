import { useEffect, useRef } from "react";

import {
  createOffscreenRenderer,
  frameCurrentView,
  frameRegion,
} from "../../export/offscreenRenderer";
import { useViewerStoreApi } from "../../state/store/core/ViewerStoreContext";
import type { Bounds } from "../canvas/Measurements/calculateViewStateToFitBounds";

interface FramedViewPreviewProps {
  aspect: "as-viewed" | "16:9" | "4:3";
  /** Level-0 bounds of the selected annotation region, or null for the current view. */
  regionBounds?: Bounds | null;
}

const PREVIEW_ASPECTS = {
  "as-viewed": 16 / 10,
  "16:9": 16 / 9,
  "4:3": 4 / 3,
} as const;

const PREVIEW_WIDTH = 420;

/**
 * Live preview of the framed view: an off-screen deck rendered through the
 * same layer builders the export uses, blitted into a visible canvas beside
 * the export form. Unlike a snapshot of the live canvas, regions outside the
 * current viewport render real tissue — the preview frames the same extent
 * the export will render.
 */
export const FramedViewPreview = ({ aspect, regionBounds }: FramedViewPreviewProps) => {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const store = useViewerStoreApi();

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;

    const state = store.getState();
    const viewStateActive = state.viewStateActive;
    if (!viewStateActive) return;

    const previewHeight = Math.round(PREVIEW_WIDTH / PREVIEW_ASPECTS[aspect]);
    const renderer = createOffscreenRenderer({
      store,
      width: PREVIEW_WIDTH,
      height: previewHeight,
      devicePixelScale: 1,
      withAnnotations: false,
    });

    const visibleCanvas = document.createElement("canvas");
    visibleCanvas.className = "w-full rounded-md border border-border bg-black object-contain";
    visibleCanvas.setAttribute("aria-label", "Framed view preview");
    visibleCanvas.setAttribute("data-testid", "framed-view-preview");
    holder.appendChild(visibleCanvas);

    const framed =
      regionBounds !== null && regionBounds !== undefined
        ? frameRegion(viewStateActive, regionBounds, 1)
        : frameCurrentView(viewStateActive, 1);
    renderer.setViewState({ ...framed.viewState, width: PREVIEW_WIDTH, height: previewHeight });
    renderer.render();

    let rafHandle = 0;
    const blit = () => {
      const sourceCanvas = renderer.canvas;
      if (sourceCanvas.width > 0 && sourceCanvas.height > 0) {
        if (
          visibleCanvas.width !== sourceCanvas.width ||
          visibleCanvas.height !== sourceCanvas.height
        ) {
          visibleCanvas.width = sourceCanvas.width;
          visibleCanvas.height = sourceCanvas.height;
        }
        const context = visibleCanvas.getContext("2d");
        if (context) context.drawImage(sourceCanvas, 0, 0);
      }
      rafHandle = requestAnimationFrame(blit);
    };
    rafHandle = requestAnimationFrame(blit);

    return () => {
      cancelAnimationFrame(rafHandle);
      renderer.destroy();
      visibleCanvas.remove();
    };
  }, [aspect, regionBounds, store]);

  return <div ref={holderRef} className="w-full" />;
};
