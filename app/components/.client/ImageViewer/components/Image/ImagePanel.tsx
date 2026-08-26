import { InteractionState, OrthographicViewState } from "@deck.gl/core";
import DeckGL from "@deck.gl/react";
import { useCallback, useEffect } from "react";

import { LayersTooltip } from "./Hover/LayersTooltip";
import { useCompositeHover } from "./Hover/useCompositeHover";
import { ImageContainer } from "./ImageContainer";
import { TileLoaderIndicator } from "./TileLoaderIndicator";
import { useView } from "./useView";
import { select } from "../../state/store/selectors";
import type { ViewPort, ViewState } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { calculateViewStateToFit } from "../Measurements/calculateViewStateToFit";
import { Crosshair } from "../Measurements/Crosshair";
import { Measurements } from "../Measurements/Measurements";
import { SlideCarrier } from "../Measurements/SlideCarrier";

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
  const pinnedTooltip = useViewerStore(select.pinnedTooltip);
  const pinTooltip = useViewerStore(select.pinTooltip);
  const unpinTooltip = useViewerStore(select.unpinTooltip);

  // Debug: press "p" to pin/unpin the tooltip so it stays visible for DOM inspection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "p" && !e.ctrlKey && !e.metaKey) {
        if (pinnedTooltip) unpinTooltip();
        else pinTooltip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinnedTooltip, pinTooltip, unpinTooltip]);

  const view = useView({ width, height });

  const { layers, deckRef, onHover, getCursor } = useCompositeHover(imagePanelId, isActivePanel);

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
    ({ viewState }: { viewState: OrthographicViewState }) => {
      setViewStateActive(viewState as ViewState);
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
      <DeckGL
        ref={deckRef}
        width={width}
        height={height}
        views={[view]}
        layers={layers}
        onViewStateChange={onViewStateChange}
        viewState={{ detail: viewStateActive }}
        getCursor={getCursor}
        onHover={onHover}
        onInteractionStateChange={handleInteractionStateChange}
        _pickable={true}
        controller={true}
      />

      {(pinnedTooltip ??
        (compositeTooltip && Object.keys(compositeTooltip.sections).length > 0
          ? compositeTooltip
          : null)) && <LayersTooltip tooltip={(pinnedTooltip ?? compositeTooltip)!} />}
    </>
  );
};

export const ImagePanel = ({ imagePanelId }: { imagePanelId: number }) => {
  const activeImagePanelId = useViewerStore(select.activeImagePanelId);
  const layersStates = useViewerStore(select.layersStates);
  const imagePanels = useViewerStore((state) => state.imagePanels);
  const layersStateIndex = imagePanels[imagePanelId];
  const layerState = layersStates[layersStateIndex];
  const isChannelsLoading = layerState?.isChannelsLoading ?? 0;
  const isOverlaysLoading = layerState?.isOverlaysLoading ?? 0;
  const setCursorPosition = useViewerStore(select.setCursorPosition);
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
      }}
    >
      {(viewPort) => (
        <>
          <SlideCarrier />

          <ImagePanelInner imagePanelId={imagePanelId} viewPort={viewPort} />

          {isActivePanel && <Measurements />}

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
