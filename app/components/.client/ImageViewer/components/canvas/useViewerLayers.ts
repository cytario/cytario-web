import type { Effect, FilterContext, Layer } from "@deck.gl/core";
import { useCallback, useMemo } from "react";

import { useAnnotationsLayer } from "./Annotations/useAnnotationsLayer";
import { useChannelsLayer } from "./Channels/useChannelsLayer";
import {
  OVERLAY_COMPOSITE_LAYER_ID,
  OverlayCompositeEffect,
  OverlayCompositeLayer,
  type OverlayCompositeResult,
} from "./Overlays/OverlayComposite";
import { isOverlayLayerId } from "./Overlays/OverlaysLayer";
import { useOverlaysLayers } from "./Overlays/useOverlaysLayer";

export interface ViewerLayersResult {
  /** All layers from all providers, ready to spread into `<DeckGL layers={…}>`. */
  layers: Layer[];
  /** Effects for the composite overlay pass. */
  effects: Effect[];
  /** Filters the overlay layers out of the main color pass (they render offscreen). */
  layerFilter: (context: FilterContext) => boolean;
}

/** The one layer composition for a deck over the viewer store — channels,
 *  overlays and annotations merged with the overlay composite. Every deck
 *  (live panel, preview, capture) renders through this so the composite can
 *  never drift between surfaces. With `interactive: false` the annotations
 *  render read-only and are not pickable. */
export const useViewerLayers = (imagePanelId: number, interactive = true): ViewerLayersResult => {
  const { layers: channelLayers } = useChannelsLayer(imagePanelId);
  const { layers: overlayLayers } = useOverlaysLayers(imagePanelId);
  const { layers: annotationLayers } = useAnnotationsLayer(imagePanelId, interactive);

  // Offscreen additive-overlay composition: the effect renders the overlay layers into an
  // FBO each frame, the composite layer premultiplied-over blends the result onto the base.
  const overlayComposite = useMemo(() => {
    const result: OverlayCompositeResult = {};
    return {
      result,
      layer: new OverlayCompositeLayer({
        id: OVERLAY_COMPOSITE_LAYER_ID,
        pickable: false,
        result,
      }),
      effects: [new OverlayCompositeEffect(result)],
    };
  }, []);

  const layers = useMemo(
    () => [...channelLayers, ...overlayLayers, overlayComposite.layer, ...annotationLayers],
    [channelLayers, overlayLayers, overlayComposite.layer, annotationLayers],
  );

  // Overlay layers render offscreen only (the composite layer draws their result); they
  // must still draw in the picking pass so hovering over overlays keeps working.
  const layerFilter = useCallback(
    ({ layer, isPicking }: FilterContext) => !isOverlayLayerId(layer.id) || isPicking,
    [],
  );

  return { layers, effects: overlayComposite.effects, layerFilter };
};
