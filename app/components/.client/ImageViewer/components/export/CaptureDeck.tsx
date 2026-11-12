import DeckGL, { type DeckGLRef } from "@deck.gl/react";
import { useCallback, useRef, type CSSProperties } from "react";

import { useViewerStore } from "../../state/store/core/ViewerStoreContext";
import { select } from "../../state/store/selectors";
import type { ViewState } from "../../state/store/types";
import { useView } from "../canvas/useView";
import { useViewerLayers } from "../canvas/useViewerLayers";

export interface CaptureDeckProps {
  /** Framing the deck renders — width/height must equal the CSS size below. */
  viewState: ViewState;
  /** CSS size of the deck container — luma sizes the drawing buffer from the
   *  DOM, so this is what determines the render resolution together with
   *  `devicePixels`. */
  width: number;
  height: number;
  /** Device-pixel multiplier for the drawing buffer (the export scale). */
  devicePixels: number;
  /** Called once every layer reports loaded; receives the deck's canvas. */
  onSettled: (canvas: HTMLCanvasElement) => void;
  /** Whether annotations render read-only (non-pickable, not editable). */
  interactive?: boolean;
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
 * drawing buffer is `width × height × devicePixels` device pixels because luma
 * sizes the buffer from the DOM, so the container is always CSS-sized — never
 * detached, never a document.createElement host.
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
  devicePixels,
  onSettled,
  interactive = false,
  hidden = false,
  style,
}: CaptureDeckProps) => {
  const deckRef = useRef<DeckGLRef | null>(null);
  const settledRef = useRef(false);

  const activeImagePanelId = useViewerStore(select.activeImagePanelId);
  const { layers, effects, layerFilter } = useViewerLayers(activeImagePanelId, interactive);
  const view = useView({ width, height });

  const handleAfterRender = useCallback(() => {
    if (settledRef.current) return;
    const deck = deckRef.current?.deck;
    if (!deck?.isInitialized) return;
    if (layers.every((layer) => layer.isLoaded)) {
      settledRef.current = true;
      const canvas = deck.getCanvas();
      if (canvas) onSettled(canvas);
    }
  }, [layers, onSettled]);

  return (
    <div style={hidden ? { ...HIDDEN_STYLE, ...style } : style} aria-hidden={hidden || undefined}>
      <DeckGL
        ref={deckRef}
        width={width}
        height={height}
        views={[view]}
        layers={layers}
        effects={effects}
        layerFilter={layerFilter}
        viewState={{ detail: viewState }}
        useDevicePixels={devicePixels}
        controller={false}
        onAfterRender={handleAfterRender}
        getCursor={() => "default"}
      />
    </div>
  );
};
