import { Deck, OrthographicView, type Effect, type FilterContext, type Layer } from "@deck.gl/core";

import { buildAnnotationsLayers } from "./buildAnnotationsLayers";
import { buildChannelsLayer, columnsForPanelState } from "./buildChannelsLayerConfig";
import { buildOverlaysLayers, overlayPanelInputs } from "./buildOverlaysLayers";
import type { Bounds } from "../components/canvas/Measurements/calculateViewStateToFitBounds";
import {
  OVERLAY_COMPOSITE_LAYER_ID,
  OverlayCompositeEffect,
  OverlayCompositeLayer,
  type OverlayCompositeResult,
} from "../components/canvas/Overlays/OverlayComposite";
import { isOverlayLayerId } from "../components/canvas/Overlays/OverlaysLayer";
import type { ViewState, ViewerStore } from "../state/store/types";

/** Shared 2% margin around an annotation-region framing (preview + export). */
export const REGION_MARGIN = 0.02;

/** Everything needed to frame an export or preview of a source. */
export interface FramedExport {
  /** Off-screen view state (zoom, target) that fills the buffer with the framed extent. */
  viewState: ViewState;
  /** Level-0 pixel extent the frame covers — the native-resolution budget. */
  level0Width: number;
  level0Height: number;
}

/** Frames the current view: same target, zoom lifted by log2(scale). */
export const frameCurrentView = (viewStateActive: ViewState, scale: number): FramedExport => ({
  viewState: {
    ...viewStateActive,
    zoom: viewStateActive.zoom + Math.log2(scale),
  },
  level0Width: viewStateActive.width * 2 ** -viewStateActive.zoom,
  level0Height: viewStateActive.height * 2 ** -viewStateActive.zoom,
});

/** Frames a region's level-0 bounds with the shared margin, expanded to the
 *  viewport's aspect so the frame covers the region without cropping it. */
export const frameRegion = (
  viewStateActive: ViewState,
  bounds: Bounds,
  scale: number,
): FramedExport => {
  const [minX, minY, maxX, maxY] = bounds;
  const extentWidth = (maxX - minX) * (1 + 2 * REGION_MARGIN);
  const extentHeight = (maxY - minY) * (1 + 2 * REGION_MARGIN);
  const viewportAspect = viewStateActive.width / viewStateActive.height;
  const level0Width = Math.max(extentWidth, extentHeight * viewportAspect);
  const level0Height = level0Width / viewportAspect;
  const bufferWidth = viewStateActive.width * scale;
  return {
    viewState: {
      ...viewStateActive,
      zoom: Math.log2(bufferWidth / level0Width),
      target: [(minX + maxX) / 2, (minY + maxY) / 2],
    },
    level0Width,
    level0Height,
  };
};

export interface OffscreenRendererInput {
  store: { getState: () => ViewerStore };
  /** CSS size of the off-screen canvas — the drawing buffer follows it (luma
   *  sizes from the DOM, so a detached canvas renders nothing). */
  width: number;
  height: number;
  /** Device-pixel multiplier for the drawing buffer. */
  devicePixelScale: number;
  /** Whether annotation regions render on the off-screen pass. */
  withAnnotations: boolean;
  /** Called per tile load/finish so the caller can gate on tile idleness. */
  onTileLoad?: (id: string) => void;
  onTileFinish?: (id: string) => void;
}

export interface OffscreenRenderer {
  /** Rebuilds the layers from the current store state and re-renders. */
  render: () => void;
  /** Points the deck at a new framing without rebuilding the layers. */
  setViewState: (viewState: ViewState) => void;
  /** True once the deck has drawn at least one frame. */
  isInitialized: () => boolean;
  /** The canvas the deck renders into — read it for the composite. */
  canvas: HTMLCanvasElement;
  /** Destroys the deck and removes the hidden host. Idempotent. */
  destroy: () => void;
}

/** Mounts a hidden host + canvas and drives an off-screen deck through the
 *  same layer builders the live panel uses. Both the export and the preview
 *  render through this — one source of truth for the composite. */
export const createOffscreenRenderer = ({
  store,
  width,
  height,
  devicePixelScale,
  withAnnotations,
  onTileLoad,
  onTileFinish,
}: OffscreenRendererInput): OffscreenRenderer => {
  const storeState = store.getState();
  const imagePanelId = storeState.imagePanelIndex;
  const metadata = storeState.metadata;
  if (!metadata) throw new Error("No image metadata for the off-screen renderer.");

  const hostElement = document.createElement("div");
  hostElement.style.position = "fixed";
  hostElement.style.left = "0";
  hostElement.style.top = "0";
  hostElement.style.width = `${width}px`;
  hostElement.style.height = `${height}px`;
  hostElement.style.opacity = "0";
  hostElement.style.pointerEvents = "none";
  hostElement.setAttribute("aria-hidden", "true");
  const deckCanvas = document.createElement("canvas");
  deckCanvas.style.width = "100%";
  deckCanvas.style.height = "100%";
  hostElement.appendChild(deckCanvas);
  document.body.appendChild(hostElement);

  const overlayCompositeResult: OverlayCompositeResult = {};
  const overlayComposite = new OverlayCompositeLayer({
    id: OVERLAY_COMPOSITE_LAYER_ID,
    pickable: false,
    result: overlayCompositeResult,
  });

  const tileLoad = onTileLoad ?? (() => {});
  const tileFinish = onTileFinish ?? (() => {});

  const buildLayers = (state: ViewerStore): Layer[] => {
    const layersState = state.layersStates[state.imagePanels[imagePanelId]];
    const columns = columnsForPanelState(state, imagePanelId);
    const channelsLayer = buildChannelsLayer({
      imagePanelId,
      columns,
      rawLoader: state.loader,
      dtype: metadata.Pixels.Type ?? "Uint8",
      channelsOpacity: layersState?.channelsOpacity ?? 1,
      loadTile: tileLoad,
      finishTile: tileFinish,
    });

    const overlaysLayers = buildOverlaysLayers(
      overlayPanelInputs(state, imagePanelId),
      tileLoad,
      tileFinish,
    );

    const annotationsLayers = withAnnotations
      ? buildAnnotationsLayers({
          features: state.annotationSets.find((s) => s.id === state.activeSetId)?.features ?? [],
          annotationSets: state.annotationSets,
          activeSetId: state.activeSetId,
          annotationView: state.annotationView,
          annotationMode: state.annotationMode,
          annotationStampSize: state.annotationStampSize,
          annotationSelectedIds: state.annotationSelectedIds,
          annotationsOpacity: layersState?.annotationsOpacity ?? 1,
          showOutline: layersState?.showAnnotationOutline ?? true,
          imagePanelId,
          interactive: false,
          activeClassification: null,
          onEdit: () => {},
        })
      : [];

    return [
      ...(channelsLayer ? [channelsLayer] : []),
      ...overlaysLayers,
      overlayComposite,
      ...annotationsLayers,
    ];
  };

  const layerFilter = ({ layer, isPicking }: FilterContext) =>
    !isOverlayLayerId(layer.id) || isPicking;

  const effects: Effect[] = [new OverlayCompositeEffect(overlayCompositeResult)];

  let deck: Deck<OrthographicView[]> | null = new Deck({
    canvas: deckCanvas,
    width,
    height,
    views: [
      new OrthographicView({
        id: "detail",
        width,
        height,
        x: 0,
        y: 0,
      }),
    ],
    layers: buildLayers(store.getState()),
    effects,
    layerFilter,
    // The renderer's caller supplies the view state through `render`, which
    // rebuilds layers; the view state is fixed per renderer instance because
    // the export frames once and the preview re-creates on framing changes.
    viewState: { detail: storeState.viewStateActive as ViewState },
    controller: false,
    useDevicePixels: devicePixelScale,
    getCursor: () => "default",
  });

  return {
    render: () => {
      if (!deck) return;
      deck.setProps({ layers: buildLayers(store.getState()) });
    },
    setViewState: (viewState: ViewState) => {
      if (!deck) return;
      deck.setProps({ viewState: { detail: viewState } as never });
    },
    isInitialized: () => deck !== null && deck.isInitialized,
    canvas: deckCanvas,
    destroy: () => {
      deck?.finalize();
      deck = null;
      hostElement.remove();
    },
  };
};
