import { useEffect, useRef } from "react";

import type { Bounds } from "../canvas/Measurements/calculateViewStateToFitBounds";
import type { AspectChoice } from "../../export/decorations";
import { useViewerStore } from "../../state/store/core/ViewerStoreContext";
import { select } from "../../state/store/selectors";

interface FramedViewPreviewProps {
  aspect: AspectChoice;
  /** Level-0 bounds of the selected annotation region, or null for the current view. */
  regionBounds?: Bounds | null;
}

/**
 * Best-effort preview of the framed view: a static snapshot of the active
 * panel's live deck canvas, drawn into a preview canvas beside the export
 * form, cropped to the current view or to the selected region's extent. It is
 * a preview only — the actual export re-renders fresh at full resolution.
 */
export const FramedViewPreview = ({ aspect, regionBounds }: FramedViewPreviewProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewStateActive = useViewerStore(select.viewStateActive);

  useEffect(() => {
    const previewCanvas = canvasRef.current;
    if (!previewCanvas || !viewStateActive) return;

    // The active panel's deck canvas is the last canvas deck.gl created
    // inside the viewer's canvas area (`.client` decks append to containers).
    const deckCanvas = document.querySelector<HTMLCanvasElement>(
      "#deckgl-overlay canvas, canvas#deckgl-overlay",
    );
    if (!deckCanvas || deckCanvas.width === 0 || deckCanvas.height === 0) return;

    const context = previewCanvas.getContext("2d");
    if (!context) return;

    const previewHeight = 560;
    const ratio =
      aspect === "16:9" ? 16 / 9 : aspect === "4:3" ? 4 / 3 : deckCanvas.width / deckCanvas.height;
    const previewWidth = Math.round(previewHeight * ratio);
    previewCanvas.width = previewWidth;
    previewCanvas.height = previewHeight;

    context.fillStyle = "rgb(0, 0, 0)";
    context.fillRect(0, 0, previewWidth, previewHeight);

    // Screen rectangle the export will render: the current viewport, or the
    // selected region's level-0 bounds projected onto the live canvas. The
    // region is expanded to the viewport's aspect with the same 2% margin the
    // engine frames it with, so the preview matches the exported extent.
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = deckCanvas.width;
    let sourceHeight = deckCanvas.height;
    if (regionBounds) {
      const [minX, minY, maxX, maxY] = regionBounds;
      const margin = 0.02;
      const extentWidth = (maxX - minX) * (1 + 2 * margin);
      const extentHeight = (maxY - minY) * (1 + 2 * margin);
      const viewportAspect = deckCanvas.width / deckCanvas.height;
      const framedWidth = Math.max(extentWidth, extentHeight * viewportAspect);
      const framedHeight = framedWidth / viewportAspect;

      // Level-0 → screen px at the live zoom, relative to the viewport's
      // center (deck's orthographic target).
      const scale = 2 ** viewStateActive.zoom;
      const [targetX, targetY] = viewStateActive.target;
      const centerX = deckCanvas.width / 2;
      const centerY = deckCanvas.height / 2;
      const toScreenX = (level0X: number) => centerX + (level0X - targetX) * scale;
      const toScreenY = (level0Y: number) => centerY + (level0Y - targetY) * scale;

      const frameCenterX = (minX + maxX) / 2;
      const frameCenterY = (minY + maxY) / 2;
      sourceX = toScreenX(frameCenterX) - (framedWidth * scale) / 2;
      sourceY = toScreenY(frameCenterY) - (framedHeight * scale) / 2;
      sourceWidth = framedWidth * scale;
      sourceHeight = framedHeight * scale;
    } else if (deckCanvas.width / deckCanvas.height > ratio) {
      // Center-crop the source to the chosen aspect so the preview shows the
      // extent the export will render.
      sourceWidth = deckCanvas.height * ratio;
      sourceX = (deckCanvas.width - sourceWidth) / 2;
    } else {
      sourceHeight = deckCanvas.width / ratio;
      sourceY = (deckCanvas.height - sourceHeight) / 2;
    }

    context.drawImage(
      deckCanvas,
      Math.round(sourceX),
      Math.round(sourceY),
      Math.max(1, Math.round(sourceWidth)),
      Math.max(1, Math.round(sourceHeight)),
      0,
      0,
      previewWidth,
      previewHeight,
    );
  }, [aspect, regionBounds, viewStateActive]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="framed-view-preview"
      className="max-h-[420px] w-full rounded-md border border-border bg-black object-contain"
      aria-label="Framed view preview"
    />
  );
};
