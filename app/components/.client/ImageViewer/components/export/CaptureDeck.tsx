import DeckGL, { type DeckGLRef } from "@deck.gl/react";
import { useCallback, useEffect, useMemo, useRef, type CSSProperties } from "react";

import { scalePixelSizes } from "./scalePixelSizes";
import { useViewerStore } from "../../state/store/core/ViewerStoreContext";
import { select } from "../../state/store/selectors";
import type { ViewState } from "../../state/store/types";
import { useView } from "../canvas/useView";
import { useViewerLayers } from "../canvas/useViewerLayers";

export interface CaptureDeckProps {
  /** Framing the deck renders — width/height must equal the CSS size below. */
  viewState: ViewState;
  /** CSS size of the deck — also its drawing-buffer size, since the deck
   *  renders one device pixel per CSS pixel. */
  width: number;
  height: number;
  /** Output px per viewer CSS px: pixel-sized marks (annotation outlines,
   *  point radii) are drawn this much larger so they read as in the viewer. */
  pixelScale?: number;
  /** Called once every layer reports loaded; receives the deck's canvas. */
  onSettled: (canvas: HTMLCanvasElement) => void;
  /** Whether annotations render read-only (non-pickable, not editable). */
  interactive?: boolean;
  /** One annotation feature id to leave out — the region being exported must
   *  not draw its own boundary onto the capture. */
  excludeAnnotationId?: string | null;
  /** Mount visibly (preview) or hidden (capture run). */
  hidden?: boolean;
  style?: CSSProperties;
}

const HIDDEN_STYLE: CSSProperties = {
  position: "fixed",
  left: 0,
  top: 0,
  opacity: 0,
  pointerEvents: "none",
  zIndex: -1,
};

/**
 * The one deck surface the capture runs on: a plain `<DeckGL>` rendering the
 * shared layer composition (`useViewerLayers`) at the framed view state. The
 * drawing buffer is pinned to one device pixel per CSS pixel: deck's viewport
 * is measured in CSS pixels, so any other ratio would change the resolution
 * without the view state accounting for it. luma sizes the buffer from the
 * DOM, so the container is always CSS-sized — never detached.
 *
 * Settle: `onAfterRender` fires after each rendered frame; the deck instance
 * (via the ref) is the only place the layer instances are reachable — they are
 * the same instances `useViewerLayers` built, deck.gl matches them by id, and
 * `Layer#isLoaded` aggregates composite sublayers (viv's MultiscaleImageLayer),
 * so "every top layer isLoaded" is exactly "all tiles finished".
 */
export const CaptureDeck = ({
  viewState,
  width,
  height,
  pixelScale = 1,
  onSettled,
  interactive = false,
  excludeAnnotationId = null,
  hidden = false,
  style,
}: CaptureDeckProps) => {
  const deckRef = useRef<DeckGLRef | null>(null);
  const settledRef = useRef(false);
  // Every layer can report loaded before the first draw (nothing to load) —
  // settling then would copy a blank canvas.
  const frameRenderedRef = useRef(false);

  const activeImagePanelId = useViewerStore(select.activeImagePanelId);
  const {
    layers: viewerLayers,
    effects,
    layerFilter,
  } = useViewerLayers(activeImagePanelId, interactive, excludeAnnotationId);
  const layers = useMemo(
    () =>
      pixelScale === 1
        ? viewerLayers
        : viewerLayers.map((layer) => scalePixelSizes(layer, pixelScale)),
    [viewerLayers, pixelScale],
  );
  const view = useView({ width, height });

  // Settle can also be reached without a further rendered frame: when the
  // last tile lands between deck's redraw windows the animation loop goes
  // quiet without a dirty final frame, and onAfterRender never fires again —
  // the poll closes that gap.
  const trySettle = useCallback(() => {
    if (settledRef.current) return;
    if (!frameRenderedRef.current) return;
    const deck = deckRef.current?.deck;
    if (!deck?.isInitialized) return;
    if (layers.every((layer) => layer.isLoaded)) {
      settledRef.current = true;
      const canvas = deck.getCanvas();
      if (canvas) onSettled(canvas);
    }
  }, [layers, onSettled]);

  const handleAfterRender = useCallback(() => {
    frameRenderedRef.current = true;
    trySettle();
  }, [trySettle]);

  useEffect(() => {
    const poll = setInterval(trySettle, 500);
    return () => clearInterval(poll);
  }, [trySettle]);

  return (
    <div style={hidden ? { ...HIDDEN_STYLE, ...style } : style} aria-hidden={hidden || undefined}>
      <DeckGL
        ref={deckRef}
        // Distinct canvas id: without it the capture deck duplicates the
        // live canvas's default "deckgl-overlay" id, making that id ambiguous
        // in the DOM and in e2e selectors (same pitfall as ImagePreview).
        id="capture-deck-canvas"
        width={width}
        height={height}
        views={[view]}
        layers={layers}
        effects={effects}
        layerFilter={layerFilter}
        viewState={{ detail: viewState }}
        useDevicePixels={1}
        controller={false}
        onAfterRender={handleAfterRender}
        getCursor={() => "default"}
      />
    </div>
  );
};
