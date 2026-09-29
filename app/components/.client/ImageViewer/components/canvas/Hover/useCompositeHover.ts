import { InteractionState, PickingInfo } from "@deck.gl/core";
import type { Effect, FilterContext, Layer } from "@deck.gl/core";
import type { DeckGLRef } from "@deck.gl/react";
import { useCallback, useMemo, useRef } from "react";

import { useViewerStore, useViewerStoreApi } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import type {
  CompositeTooltip,
  LayerTooltipItem,
  TooltipSection,
} from "../../../state/store/types";
import {
  pickFeaturesAt,
  sortAnnotationItemsByClass,
  type PickedAnnotation,
  type RoutedPicks,
} from "../Annotations/pickFeaturesAt";
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
 * The hook also owns `getCursor`: pointer over non-transparent annotations in
 * view/inspect modes, crosshair in draw modes.
 */
export interface CanvasContentResult {
  /** Full tooltip content at the point (all sections) — null when nothing is picked. */
  tooltip: CompositeTooltip | null;
  /** Annotation features at the point with their set attribution — drives
   *  click-select-all and the popup's live stale-guard. */
  annotations: PickedAnnotation[];
}

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
  /** Fresh pick + content assembly at an arbitrary canvas point — the click
   *  popup / selection entry. */
  buildContent: (x: number, y: number) => CanvasContentResult;
}

export const useCompositeHover = (
  imagePanelId: number,
  isActivePanel: boolean,
): CompositeHoverResult => {
  const deckRef = useRef<DeckGLRef | null>(null);
  const storeApi = useViewerStoreApi();

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
  const clearPixelValues = useViewerStore(select.clearPixelValues);
  const annotationMode = useViewerStore((s) => s.annotationMode);

  // Ref mirror of "hovering a non-transparent annotation" — read by
  // `getCursor` without triggering re-renders.
  const hoveringAnnotationRef = useRef(false);

  /** Assemble tooltip sections from routed picks. Channels always; overlays and
   *  annotations when `includeAnnotations` (hover: inspect mode only; popup: always). */
  const collectSections = useCallback(
    (routed: RoutedPicks, includeAnnotations: boolean) => {
      const sections: Partial<Record<TooltipSection, LayerTooltipItem[]>> = {};
      let hoveringAnnotation = false;

      for (const pick of routed.channelPicks) {
        for (const it of getChannelTooltipItems(pick)) (sections.Channels ??= []).push(it);
      }
      if (includeAnnotations) {
        for (const pick of routed.overlayPicks) {
          for (const it of getOverlayTooltipItems(pick)) (sections.Overlays ??= []).push(it);
        }

        // Group the point's regions by class name — z-order otherwise
        // interleaves them (Unclassified → Ipsum → Unclassified …).
        const annotationItems = sortAnnotationItemsByClass(
          routed.annotations.flatMap(({ pick }) => getAnnotationTooltipItems(pick)),
        );
        if (annotationItems.length > 0) {
          hoveringAnnotation = true;
          (sections.Annotations ??= []).push(...annotationItems);
        }
      }
      return { sections, hoveringAnnotation };
    },
    [getChannelTooltipItems, getOverlayTooltipItems, getAnnotationTooltipItems],
  );

  /** Fresh tooltip content at an arbitrary canvas point (panel-relative deck
   *  coordinates) — the click popup builds its own pick instead of reusing
   *  hover state, which goes stale after pan/zoom and is empty in view mode. */
  const buildContent = useCallback(
    (x: number, y: number): CanvasContentResult => {
      const deck = deckRef.current?.deck;
      if (!deck) return { tooltip: null, annotations: [] };
      const routed = pickFeaturesAt(deck, x, y, storeApi.getState());
      const { sections } = collectSections(routed, true);
      const tooltip: CompositeTooltip = {
        panelId: imagePanelId,
        cursor: { x, y },
        sections,
      };
      return { tooltip, annotations: routed.annotations };
    },
    [deckRef, storeApi, imagePanelId, collectSections],
  );

  const onHover = useCallback(
    (info: PickingInfo) => {
      const isInspect = annotationMode === "inspect";
      // Tooltip only renders in inspect mode — not in view or draw modes.
      if (!isInspect) setCompositeTooltip(null);

      const deck = deckRef.current?.deck;
      if (!deck) return;

      const routed = pickFeaturesAt(deck, info.x, info.y, storeApi.getState());

      if (routed.picks.length === 0) {
        hoveringAnnotationRef.current = false;
        setCompositeTooltip(null);
        clearPixelValues();
        return;
      }

      // Channels — always process, in every mode, so the sidebar pixel
      // readout stays live. Overlays and annotations only feed the tooltip
      // (inspect mode only). Transparent picks (hidden class) are already
      // filtered by `pickFeaturesAt`; `getTooltipItems` double-checks.
      const { sections, hoveringAnnotation } = collectSections(routed, isInspect);

      hoveringAnnotationRef.current = hoveringAnnotation;

      if (!isInspect) return;

      const tooltip: CompositeTooltip = {
        panelId: imagePanelId,
        cursor: { x: info.x, y: info.y },
        sections,
      };
      setCompositeTooltip(tooltip);
    },
    [
      annotationMode,
      setCompositeTooltip,
      clearPixelValues,
      storeApi,
      imagePanelId,
      collectSections,
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
    buildContent,
  };
};
