import DeckGL, { type DeckGLRef } from "@deck.gl/react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

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
  /** Called once the framed extent has rendered with no failed tiles. */
  onSettled: (canvas: HTMLCanvasElement) => void;
  /** Called when the framed extent cannot render — nothing was selected, or a
   *  tile failed. A capture that renders nothing must not be delivered. */
  onFailed: (message: string) => void;
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

type DeckLike = {
  isInitialized?: boolean;
  getCanvas?: () => HTMLCanvasElement | null;
};

/**
 * The one deck surface the capture runs on: a plain `<DeckGL>` rendering the
 * shared layer composition (`useViewerLayers`) at the framed view state. The
 * drawing buffer is pinned to one device pixel per CSS pixel: deck's viewport
 * is measured in CSS pixels, so any other ratio would change the resolution
 * without the view state accounting for it. luma sizes the buffer from the
 * DOM, so the container is always CSS-sized — never detached.
 *
 * Ready means the tile layer said so. deck's `onViewportLoad` fires from the
 * tileset when the current viewport's tiles are loaded, and hands over the
 * selected tiles — so it also distinguishes a finished render from an empty
 * selection, which `isLoaded` cannot: a fresh CompositeLayer has no sublayers
 * yet, `[].every(...)` is true, and a tileset whose selection is empty reports
 * loaded too. Either way a settle on `isLoaded` alone can copy a canvas that
 * was never drawn into.
 *
 * The capture never reads the viewer's loading counters: they are a cosmetic
 * indicator (see `useTilesLoading`), they are written by both this deck and
 * the live panel, and they undercount a multi-channel tile. Readiness belongs
 * to this deck's own layers.
 */
export const CaptureDeck = ({
  viewState,
  width,
  height,
  pixelScale = 1,
  onSettled,
  onFailed,
  interactive = false,
  excludeAnnotationId = null,
  hidden = false,
  style,
}: CaptureDeckProps) => {
  const deckRef = useRef<DeckGLRef | null>(null);
  const settledRef = useRef(false);
  const failedRef = useRef(false);
  const [failedTile, setFailedTile] = useState<string | null>(null);

  const activeImagePanelId = useViewerStore(select.activeImagePanelId);

  // Stable identity: the observer reaches the layer's props, and a new object
  // per render would rebuild the layer and re-trigger its tile requests.
  const observer = useMemo(
    () => ({
      onViewportLoad: (tileCount: number) => {
        if (settledRef.current || failedRef.current) return;
        if (tileCount === 0) {
          // Nothing was selected for the framed extent: the canvas holds no
          // image content. Reporting loaded here is exactly the blank-export
          // path, so fail instead of delivering it.
          failedRef.current = true;
          onFailed(
            "The selected area contains no image data — it lies outside the scanned region.",
          );
          return;
        }
        settledRef.current = true;
        const canvas = (deckRef.current?.deck as DeckLike | null)?.getCanvas?.();
        if (canvas) onSettled(canvas);
        else {
          settledRef.current = false;
          failedRef.current = true;
          onFailed("The capture surface did not produce a canvas.");
        }
      },
      onTileError: () => {
        if (settledRef.current || failedRef.current) return;
        failedRef.current = true;
        setFailedTile("A tile of the selected area could not be loaded.");
      },
    }),
    [onFailed, onSettled],
  );

  const {
    layers: viewerLayers,
    effects,
    layerFilter,
  } = useViewerLayers(activeImagePanelId, interactive, excludeAnnotationId, observer);
  const layers = useMemo(
    () =>
      pixelScale === 1
        ? viewerLayers
        : viewerLayers.map((layer) => scalePixelSizes(layer, pixelScale)),
    [viewerLayers, pixelScale],
  );
  const view = useView({ width, height });

  useEffect(() => {
    if (failedTile) onFailed(failedTile);
  }, [failedTile, onFailed]);

  // Layers mount one frame after the deck. deck applies the view state at
  // construction, but the canvas is sized from the DOM, so a layer created in
  // the same commit can select tiles against a not-yet-measured viewport. One
  // frame of separation makes the tile selection run against the framed
  // viewport by construction rather than by tolerance.
  const [layersMounted, setLayersMounted] = useState(false);
  useEffect(() => {
    const handle = requestAnimationFrame(() => setLayersMounted(true));
    return () => cancelAnimationFrame(handle);
  }, []);

  const handleAfterRender = useCallback(() => {}, []);

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
        layers={layersMounted ? layers : []}
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
