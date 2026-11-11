import { useEffect, useRef } from "react";

import type { AspectChoice } from "../../export/decorations";
import { useViewerStore } from "../../state/store/core/ViewerStoreContext";
import { select } from "../../state/store/selectors";

/**
 * Best-effort preview of the framed view: a static snapshot of the active
 * panel's live deck canvas, drawn into a preview canvas beside the export
 * form. It is a preview only — the actual export re-renders fresh at full resolution.
 */
export const FramedViewPreview = ({ aspect }: { aspect: AspectChoice }) => {
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

    // Center-crop the source to the chosen aspect so the preview shows the
    // extent the export will render.
    const sourceRatio = deckCanvas.width / deckCanvas.height;
    let sourceWidth = deckCanvas.width;
    let sourceHeight = deckCanvas.height;
    if (sourceRatio > ratio) {
      sourceWidth = deckCanvas.height * ratio;
    } else {
      sourceHeight = deckCanvas.width / ratio;
    }
    const offsetX = (deckCanvas.width - sourceWidth) / 2;
    const offsetY = (deckCanvas.height - sourceHeight) / 2;

    context.drawImage(
      deckCanvas,
      offsetX,
      offsetY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      previewWidth,
      previewHeight,
    );
  }, [aspect, viewStateActive]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="framed-view-preview"
      className="max-h-[420px] w-full rounded-md border border-border bg-black object-contain"
      aria-label="Framed view preview"
    />
  );
};
