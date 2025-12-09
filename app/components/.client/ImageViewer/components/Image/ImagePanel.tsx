import {
  InteractionState,
  OrthographicViewState,
  PickingInfo,
} from "@deck.gl/core";
import DeckGL from "@deck.gl/react";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { useChannelsLayer } from "./Channels/useChannelsLayer";
import { ImageContainer } from "./ImageContainer";
import { useOverlaysLayers } from "./Overlays/useOverlaysLayer";
import { useView } from "./useView";
import { select } from "../../state/selectors";
import { ViewPort, ViewState } from "../../state/types";
import { useViewerStore } from "../../state/ViewerStoreContext";
import { handleImageViewerHover } from "../../utils/handleImageViewerHover";
import { mapChannelConfigsToState } from "../../utils/mapChannelConfigsToState";
import { useFeatureBarStore } from "../FeatureBar/useFeatureBar";
import { calculateViewStateToFit } from "../Measurements/calculateViewStateToFit";
import { Crosshair } from "../Measurements/Crosshair";
import { Measurements } from "../Measurements/Measurements";
import SlideCarrier from "../Measurements/SlideCarrier";

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

  // TODO: Hoist tooltip state in a more global context
  const [tooltip, setTooltip] = useState<{
    content: ReactNode;
    x: number;
    y: number;
  } | null>(null);

  const view = useView({ width, height });

  const channelsState = useViewerStore(
    (store) => store.layersStates[store.imagePanels[imagePanelId]].channels
  );

  /** Setup Orthographic View */
  const { ids } = useMemo(
    () => mapChannelConfigsToState(channelsState ?? {}),
    [channelsState]
  );
  const setPixelValues = useFeatureBarStore((state) => state.setPixelValues);

  const onMultiscaleLayerHover = useCallback(
    (info: PickingInfo) => {
      const data = handleImageViewerHover(info);
      // console.log("hover", data);
      setPixelValues(ids, data ? data.hoverData : ids.map(() => 0));
    },
    [ids, setPixelValues]
  );

  /* Setup Layers */
  const multiscaleLayer = useChannelsLayer(
    imagePanelId,
    onMultiscaleLayerHover
  );
  const markersLayers = useOverlaysLayers(imagePanelId, setTooltip);
  const layers = [multiscaleLayer, ...markersLayers];

  useEffect(() => {
    if (!metadata || !width || !height) return;

    if (!viewStateActive) {
      const initViewState = calculateViewStateToFit(
        metadata,
        { width, height },
        { padding }
      );

      setViewStateActive(initViewState);
    } else if (
      viewStateActive.width !== width ||
      viewStateActive.height !== height
    ) {
      setViewStateActive({ ...viewStateActive, width, height });
    }
  }, [metadata, padding, setViewStateActive, width, height, viewStateActive]);

  const onViewStateChange = useCallback(
    ({ viewState }: { viewState: OrthographicViewState }) => {
      setViewStateActive(viewState as ViewState);
    },
    [setViewStateActive]
  );

  const handleInteractionStateChange = useCallback(
    (event: InteractionState) => {
      const { isDragging, isPanning, isZooming } = event;
      if (
        (isDragging || isPanning || isZooming) &&
        activeImagePanelId !== imagePanelId
      ) {
        setActiveImagePanelId(imagePanelId);
      }
    },
    [activeImagePanelId, imagePanelId, setActiveImagePanelId]
  );

  const getCursor = useCallback(
    ({ isDragging }: InteractionState) => {
      if (!isActivePanel) {
        return "pointer";
      }
      if (isDragging) {
        return "grabbing";
      }
      return "crosshair";
    },
    [isActivePanel]
  );

  if (!loader || loader.length === 0 || !viewStateActive) return null;

  return (
    <>
      <DeckGL
        width={width}
        height={height}
        views={[view]}
        layers={layers}
        onViewStateChange={onViewStateChange}
        viewState={{ detail: viewStateActive }}
        getCursor={getCursor}
        onInteractionStateChange={handleInteractionStateChange}
        _pickable={true}
        controller={true}
      />

      {tooltip && (
        <div
          className={`
            absolute px-2 py-1 rounded shadow-lg
            bg-slate-900 
            border border-slate-700 
            text-white text-sm
            pointer-events-none
          `}
          style={{
            left: tooltip.x, //adjustedCoords.x,
            top: tooltip.y, //adjustedCoords.y,
          }}
        >
          {tooltip.content}
        </div>
      )}
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

const TileLoaderIndicator = ({
  isChannelsLoading,
  isOverlaysLoading,
}: {
  isChannelsLoading: number;
  isOverlaysLoading: number;
}) => {
  const channelsLoadingTiles = new Array(isChannelsLoading).fill(0);
  const overlaysLoadingTiles = new Array(isOverlaysLoading).fill(0);
  return (
    <div className="absolute top-0 left-0 pointer-events-none">
      <div className="flex">
        {channelsLoadingTiles.map((_, index) => (
          <div
            key={index}
            className="w-2 h-2 rounded-sm m-1 bg-white border border-slate-700 animate-pulse"
          />
        ))}
      </div>
      <div className="flex">
        {overlaysLoadingTiles.map((_, index) => (
          <div
            key={index}
            className="w-2 h-2 rounded-sm m-1 bg-white border border-slate-700 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
};
