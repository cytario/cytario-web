import { InteractionState, PickingInfo } from "@deck.gl/core";
import type { Effect, FilterContext, Layer } from "@deck.gl/core";
import type { DeckGLRef } from "@deck.gl/react";
import { useCallback, useMemo, useRef } from "react";

import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import type {
  CompositeTooltip,
  LayerTooltipItem,
  TooltipSection,
} from "../../../state/store/types";
import { useAnnotationsLayer } from "../Annotations/useAnnotationsLayer";
import { useChannelsLayer } from "../Channels/useChannelsLayer";
import {
  OVERLAYS_ID_PREFIX,
  OVERLAY_COMPOSITE_LAYER_ID,
  OverlayCompositeEffect,
  OverlayCompositeLayer,
  type OverlayCompositeResult,
} from "../Overlays/OverlayComposite";
import { useOverlaysLayers } from "../Overlays/useOverlaysLayer";

/**
 * Single hover orchestrator for the image viewer: calls the three layer hooks,
 * merges their layers, and provides a deck.gl-level `onHover` using
 * `deck.pickMultipleObjects` to gather all picks at the cursor — each routed by
 * layer-id prefix to the provider's `getTooltipItems`. Transparent annotation picks
 * (hidden class → alpha 0) return `[]` so they no longer steal the cursor from
 * pixel reads beneath them.
 *
 * The hook also owns `getCursor`, which shows a pointer over non-transparent
 * annotations in view mode and a crosshair in draw mode.
 */
export interface CompositeHoverResult {
  /** All layers from all providers, ready to spread into `<DeckGL layers={…}>`. */
  layers: Layer[];
  /** Effects for the composite overlay pass. */
  effects: Effect[];
  /** Filters the overlay layers out of the main color pass (they render offscreen). */
  layerFilter: (context: FilterContext) => boolean;
  /** Ref to attach to `<DeckGL ref={…}>` — needed for `pickMultipleObjects`. */
  deckRef: React.RefObject<DeckGLRef | null>;
  /** deck.gl `onHover` handler. */
  onHover: (info: PickingInfo, event: { srcEvent?: { shiftKey?: boolean } }) => void;
  /** deck.gl `getCursor` handler. */
  getCursor: (state: InteractionState) => string;
}

/** Layer-id prefixes used to route picks to the right provider. */
const CHANNELS_ID_HINT = "channels-";
const ANNOTATIONS_ID_PREFIX = "annotations-";
const ANNOTATIONS_SELECTION_SUFFIX = "-selection-";

export const useCompositeHover = (
  imagePanelId: number,
  isActivePanel: boolean,
): CompositeHoverResult => {
  const deckRef = useRef<DeckGLRef | null>(null);

  const { layers: channelLayers, getTooltipItems: getChannelTooltipItems } =
    useChannelsLayer(imagePanelId);
  const { layers: overlayLayers, getTooltipItems: getOverlayTooltipItems } =
    useOverlaysLayers(imagePanelId);
  const { layers: annotationLayers, getTooltipItems: getAnnotationTooltipItems } =
    useAnnotationsLayer(imagePanelId);

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
    ({ layer, isPicking }: FilterContext) => !layer.id.startsWith(OVERLAYS_ID_PREFIX) || isPicking,
    [],
  );

  const setCompositeTooltip = useViewerStore(select.setCompositeTooltip);
  const setHoverMode = useViewerStore(select.setHoverMode);
  const clearPixelValues = useViewerStore(select.clearPixelValues);
  const annotationMode = useViewerStore((s) => s.annotationMode);

  // Ref mirror of "hovering a non-transparent annotation" — read by
  // `getCursor` without triggering re-renders.
  const hoveringAnnotationRef = useRef(false);

  const onHover = useCallback(
    (info: PickingInfo, event?: { srcEvent?: { shiftKey?: boolean } }) => {
      const isInspect = annotationMode === "inspect";
      // Tooltip only renders in inspect mode — not in view or draw modes.
      if (!isInspect) setCompositeTooltip(null);

      const deck = deckRef.current?.deck;
      if (!deck) return;

      const picks = deck.pickMultipleObjects({
        x: info.x,
        y: info.y,
        radius: 0,
        depth: 20,
      });

      if (picks.length === 0) {
        hoveringAnnotationRef.current = false;
        setCompositeTooltip(null);
        clearPixelValues();
        return;
      }

      const sections: Partial<Record<TooltipSection, LayerTooltipItem[]>> = {};
      let hoveringAnnotation = false;

      for (const pick of picks) {
        const layerId = pick.layer?.id ?? "";

        // Channels — always process, in every mode, so the sidebar pixel
        // readout stays live. The sublayers are `Tiled-Image-channels-<id>`
        // and `Background-Image-channels-<id>`, both contain `channels-`.
        if (layerId.includes(CHANNELS_ID_HINT)) {
          for (const it of getChannelTooltipItems(pick)) (sections.Channels ??= []).push(it);
          continue;
        }

        // Overlays and annotations only feed the tooltip (inspect mode only).
        if (!isInspect) continue;

        // Overlays
        if (layerId.startsWith(OVERLAYS_ID_PREFIX)) {
          for (const it of getOverlayTooltipItems(pick)) (sections.Overlays ??= []).push(it);
          continue;
        }

        // Annotations — skip selection-halo layers (pickable: false, but
        // guard anyway). Transparent picks (hidden class) return `[]` from
        // `getTooltipItems`, so they don't contribute items or set the
        // annotation-hover flag.
        if (
          layerId.startsWith(ANNOTATIONS_ID_PREFIX) &&
          !layerId.includes(ANNOTATIONS_SELECTION_SUFFIX)
        ) {
          const items = getAnnotationTooltipItems(pick);
          if (items.length > 0) {
            hoveringAnnotation = true;
            (sections.Annotations ??= []).push(...items);
          }
        }
      }

      hoveringAnnotationRef.current = hoveringAnnotation;

      if (!isInspect) return;

      // Shift toggles verbose mode.
      const shift = event?.srcEvent?.shiftKey ?? false;
      setHoverMode(shift ? "verbose" : "compact");

      const tooltip: CompositeTooltip = {
        cursor: { x: info.x, y: info.y },
        coordinate: info.coordinate ?? [0, 0, 0],
        sections,
        mode: shift ? "verbose" : "compact",
      };
      setCompositeTooltip(tooltip);
    },
    [
      annotationMode,
      getChannelTooltipItems,
      getOverlayTooltipItems,
      getAnnotationTooltipItems,
      setCompositeTooltip,
      setHoverMode,
      clearPixelValues,
    ],
  );

  const getCursor = useCallback(
    (state: InteractionState) => {
      if (!isActivePanel) return "pointer";
      if (annotationMode === "view" || annotationMode === "inspect") {
        if (hoveringAnnotationRef.current) return "pointer";
        return state.isDragging ? "grabbing" : "grab";
      }
      return "crosshair";
    },
    [isActivePanel, annotationMode],
  );

  return {
    layers,
    effects: overlayComposite.effects,
    layerFilter,
    deckRef,
    onHover,
    getCursor,
  };
};
