import { InteractionState, PickingInfo } from "@deck.gl/core";
import type { Layer } from "@deck.gl/core";
import type { DeckGLRef } from "@deck.gl/react";
import { useCallback, useMemo, useRef } from "react";

import { select } from "../../../state/store/selectors";
import type {
  CompositeTooltip,
  LayerTooltipItem,
  TooltipSection,
} from "../../../state/store/slices/viewer.view.store";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { useAnnotationsLayer } from "../Annotations/useAnnotationsLayer";
import { useChannelsLayer } from "../Channels/useChannelsLayer";
import { useOverlaysLayers } from "../Overlays/useOverlaysLayer";

/**
 * Single hover orchestrator for the image viewer (C-427).
 *
 * Calls the three layer hooks, merges their layers into one array, and
 * provides a deck.gl-level `onHover` that uses `deck.pickMultipleObjects`
 * to gather **all** picks at the cursor position — not just the topmost.
 * Each pick is routed by layer-id prefix to the matching provider's
 * `getTooltipItems`; transparent annotation picks (hidden class → alpha 0)
 * return `[]` so they no longer steal the cursor from pixel reads beneath
 * them. The merged items array is published to the store as a
 * `CompositeTooltip`.
 *
 * The hook also owns the `getCursor` callback, which shows a pointer over
 * non-transparent annotations in view mode and a crosshair in draw mode.
 */
export interface CompositeHoverResult {
  /** All layers from all providers, ready to spread into `<DeckGL layers={…}>`. */
  layers: Layer[];
  /** Ref to attach to `<DeckGL ref={…}>` — needed for `pickMultipleObjects`. */
  deckRef: React.RefObject<DeckGLRef | null>;
  /** deck.gl `onHover` handler. */
  onHover: (info: PickingInfo, event: { srcEvent?: { shiftKey?: boolean } }) => void;
  /** deck.gl `getCursor` handler. */
  getCursor: (state: InteractionState) => string;
}

/** Layer-id prefixes used to route picks to the right provider. */
const CHANNELS_ID_HINT = "channels-";
const OVERLAYS_ID_PREFIX = "MarkersLayer-";
const ANNOTATIONS_ID_PREFIX = "annotations-";
const ANNOTATIONS_SELECTION_SUFFIX = "-selection-";

/**
 * Orchestrates hover across all layers (channels, overlays, annotations) and
 * produces a single composite tooltip. Each layer hook exposes a
 * `getTooltipItems` callback; this hook calls them in priority order, merges
 * results into a flat `LayerTooltipItem[]`, and writes it to the viewer
 * store. Transparent/hidden annotations are filtered out by returning `[]`
 * from their `getTooltipItems`.
 */
export const useCompositeHover = (
  imagePanelId: number,
  isActivePanel: boolean,
): CompositeHoverResult => {
  const deckRef = useRef<DeckGLRef | null>(null);

  // --- Layer providers ---------------------------------------------------
  const { layers: channelLayers, getTooltipItems: getChannelTooltipItems } =
    useChannelsLayer(imagePanelId);
  const { layers: overlayLayers, getTooltipItems: getOverlayTooltipItems } =
    useOverlaysLayers(imagePanelId);
  const { layers: annotationLayers, getTooltipItems: getAnnotationTooltipItems } =
    useAnnotationsLayer(imagePanelId);

  const layers = useMemo(
    () => [...channelLayers, ...overlayLayers, ...annotationLayers],
    [channelLayers, overlayLayers, annotationLayers],
  );

  // --- Store actions -----------------------------------------------------
  const setCompositeTooltip = useViewerStore(select.setCompositeTooltip);
  const setHoverMode = useViewerStore(select.setHoverMode);
  const annotationMode = useViewerStore((s) => s.annotationMode);

  // Ref mirror of "hovering a non-transparent annotation" — read by
  // `getCursor` without triggering re-renders.
  const hoveringAnnotationRef = useRef(false);

  // --- Hover pipeline ----------------------------------------------------
  const onHover = useCallback(
    (info: PickingInfo, event?: { srcEvent?: { shiftKey?: boolean } }) => {
      // Tooltip only renders in inspect mode — not in view or draw modes.
      if (annotationMode !== "inspect") {
        setCompositeTooltip(null);
        return;
      }

      // Shift toggles verbose mode (future: Phase 3 keyboard inspect).
      const shift = event?.srcEvent?.shiftKey ?? false;
      setHoverMode(shift ? "verbose" : "compact");

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
        return;
      }

      const sections: Partial<Record<TooltipSection, LayerTooltipItem[]>> = {};
      let hoveringAnnotation = false;

      for (const pick of picks) {
        const layerId = pick.layer?.id ?? "";

        // Channels — always process the first channels pick we encounter.
        // The sublayers are `Tiled-Image-channels-<id>` and
        // `Background-Image-channels-<id>`, both contain `channels-`.
        if (layerId.includes(CHANNELS_ID_HINT)) {
          for (const it of getChannelTooltipItems(pick)) (sections.Channels ??= []).push(it);
          continue;
        }

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
    ],
  );

  // --- Cursor ------------------------------------------------------------
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

  return { layers, deckRef, onHover, getCursor };
};
