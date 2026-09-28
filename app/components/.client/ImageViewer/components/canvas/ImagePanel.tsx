import { InteractionState, OrthographicViewState } from "@deck.gl/core";
import DeckGL from "@deck.gl/react";
import { useCallback, useEffect } from "react";

import { StampGhost } from "./Annotations/StampGhost";
import { useCanvasAnnotationContextMenu } from "./Annotations/useCanvasAnnotationContextMenu";
import { ImagePopupLayer } from "./Hover/ImagePopupLayer";
import { LayersTooltip } from "./Hover/LayersTooltip";
import { useCanvasClickInteraction } from "./Hover/useCanvasClickInteraction";
import { useCompositeHover } from "./Hover/useCompositeHover";
import { ImageContainer } from "./ImageContainer";
import { calculateViewStateToFit } from "./Measurements/calculateViewStateToFit";
import { Crosshair } from "./Measurements/Crosshair";
import { Measurements } from "./Measurements/Measurements";
import { SlideCarrier } from "./Measurements/SlideCarrier";
import { TileLoaderIndicator } from "./TileLoaderIndicator";
import { useView } from "./useView";
import { useViewerStore } from "../../state/store/core/ViewerStoreContext";
import { select } from "../../state/store/selectors";
import type { ViewPort, ViewState } from "../../state/store/types";
import { useViewerDisplayStore } from "~/utils/viewerDisplayStore/useViewerDisplayStore";

export interface ViewProps {
  viewPort: ViewPort;
  imagePanelId: number;
  padding?: number;
}

const ImagePanelInner = ({
  imagePanelId,
  viewPort: { width, height },
  padding = 48,
}: ViewProps) => {
  const metadata = useViewerStore(select.metadata);
  const loader = useViewerStore(select.loader);

  const viewStateActive = useViewerStore((store) => store.viewStateActive);
  const setViewStateActive = useViewerStore(select.setViewStateActive);

  const activeImagePanelId = useViewerStore(select.activeImagePanelId);
  const setActiveImagePanelId = useViewerStore(select.setActiveImagePanelId);

  const isActivePanel = activeImagePanelId === imagePanelId;

  const compositeTooltip = useViewerStore(select.compositeTooltip);
  // Hover tooltip is suppressed on this panel while its popup is open — two
  // cursor-anchored surfaces at once is visual noise.
  const popupOpenHere = useViewerStore((s) => s.popup?.panelId === imagePanelId);

  const view = useView({ width, height });

  const { layers, effects, layerFilter, deckRef, onHover, getCursor, buildContent } =
    useCompositeHover(imagePanelId, isActivePanel);

  // Left-click selects every feature at the point and opens the popup.
  const { onCanvasClick } = useCanvasClickInteraction({ imagePanelId, buildContent });

  // Right-click on an annotation polygon opens the shared annotation menu;
  // `<DeckGL>` doesn't forward DOM props, so the capture listener sits on a
  // wrapper (events bubble through it from the canvas).
  const { onCanvasContextMenu, menu: canvasContextMenu } = useCanvasAnnotationContextMenu({
    deckRef,
  });

  useEffect(() => {
    if (!isActivePanel || !metadata || !width || !height) return;

    if (!viewStateActive) {
      const initViewState = calculateViewStateToFit(metadata, { width, height }, { padding });
      setViewStateActive(initViewState);
    } else if (viewStateActive.width !== width || viewStateActive.height !== height) {
      const updatedViewState = { ...viewStateActive, width, height };
      setViewStateActive(updatedViewState);
    }
  }, [isActivePanel, metadata, padding, setViewStateActive, width, height, viewStateActive]);

  const onViewStateChange = useCallback(
    ({ viewState: { zoom, target } }: { viewState: OrthographicViewState }) => {
      setViewStateActive({ zoom, target } as ViewState);
    },
    [setViewStateActive],
  );

  const handleInteractionStateChange = useCallback(
    (event: InteractionState) => {
      const { isDragging, isPanning, isZooming } = event;
      if ((isDragging || isPanning || isZooming) && activeImagePanelId !== imagePanelId) {
        setActiveImagePanelId(imagePanelId);
      }
    },
    [activeImagePanelId, imagePanelId, setActiveImagePanelId],
  );

  if (!loader || loader.length === 0 || !viewStateActive) return null;

  return (
    <>
      <div className="contents" onContextMenuCapture={onCanvasContextMenu}>
        <DeckGL
          ref={deckRef}
          width={width}
          height={height}
          views={[view]}
          layers={layers}
          effects={effects}
          layerFilter={layerFilter}
          onViewStateChange={onViewStateChange}
          viewState={{ detail: viewStateActive }}
          getCursor={getCursor}
          onHover={onHover}
          onClick={onCanvasClick}
          onInteractionStateChange={handleInteractionStateChange}
          _pickable={true}
          controller={true}
        />
      </div>

      {canvasContextMenu}

      <ImagePopupLayer imagePanelId={imagePanelId} />

      {!popupOpenHere &&
        compositeTooltip?.panelId === imagePanelId &&
        Object.keys(compositeTooltip.sections).length > 0 && (
          <LayersTooltip tooltip={compositeTooltip} />
        )}
    </>
  );
};

export const ImagePanel = ({ imagePanelId }: { imagePanelId: number }) => {
  const activeImagePanelId = useViewerStore(select.activeImagePanelId);
  // Narrow selectors: the whole `layersStates` array changes on every tile
  // load/finish (and on every channel edit), so subscribing to it re-rendered
  // this panel far more than the two loading counters it actually reads.
  const isChannelsLoading = useViewerStore((state) => {
    const layersStateIndex = state.imagePanels[imagePanelId];
    return state.layersStates[layersStateIndex]?.isChannelsLoading ?? 0;
  });
  const isOverlaysLoading = useViewerStore((state) => {
    const layersStateIndex = state.imagePanels[imagePanelId];
    return state.layersStates[layersStateIndex]?.isOverlaysLoading ?? 0;
  });
  const setCursorPosition = useViewerStore(select.setCursorPosition);
  const rulersVisible = useViewerDisplayStore((state) => state.rulersVisible);
  const clearPixelValues = useViewerStore(select.clearPixelValues);
  const setActiveImagePanelId = useViewerStore(select.setActiveImagePanelId);
  const isActivePanel = activeImagePanelId === imagePanelId;

  return (
    <ImageContainer
      isActivePanel={isActivePanel}
      onClick={() => {
        if (typeof imagePanelId === "number") {
          setActiveImagePanelId(imagePanelId);
        }
      }}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        setCursorPosition({ x, y });
      }}
      onPointerLeave={() => {
        setCursorPosition(null);
        clearPixelValues();
      }}
    >
      {(viewPort) => (
        <>
          <SlideCarrier />

          <ImagePanelInner imagePanelId={imagePanelId} viewPort={viewPort} />

          {isActivePanel && rulersVisible && <Measurements />}

          {isActivePanel && <StampGhost />}

          {!isActivePanel && <Crosshair />}

          <TileLoaderIndicator
            isChannelsLoading={isChannelsLoading}
            isOverlaysLoading={isOverlaysLoading}
          />
        </>
      )}
    </ImageContainer>
  );
};
