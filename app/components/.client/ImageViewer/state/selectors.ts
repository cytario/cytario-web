import { ChannelConfig, ChannelsStateColumns, ViewerStore } from "./types";

const EMPTY_OBJECT = Object.freeze({});
const EMPTY_ARRAY: readonly string[] = Object.freeze([]);
export const select = {
  id: (state: ViewerStore) => state.id,
  error: (state: ViewerStore) => state.error,

  isViewerLoading: (state: ViewerStore) => state.isViewerLoading,

  /* Loader */
  loader: (state: ViewerStore) => state.loader,
  setLoader: (state: ViewerStore) => state.setLoader,

  /* Metadata */
  metadata: (state: ViewerStore) => state.metadata,
  setMetadata: (state: ViewerStore) => state.setMetadata,

  minZoom: (state: ViewerStore) => -(state.loader?.length ?? 0),
  // max double interpolation
  maxZoom: () => 2,

  /* View State Preview */
  viewStatePreview: (state: ViewerStore) => state.viewStatePreview,
  setViewStatePreview: (state: ViewerStore) => state.setViewStatePreview,

  /* View State Active */
  viewStateActive: (state: ViewerStore) => state.viewStateActive,
  setViewStateActive: (state: ViewerStore) => state.setViewStateActive,

  setIsViewerLoading: (state: ViewerStore) => state.setIsViewerLoading,

  /* Tile Loading (per panel) */
  setIsChannelsLoading: (state: ViewerStore) => state.setIsChannelsLoading,
  setIsOverlaysLoading: (state: ViewerStore) => state.setIsOverlaysLoading,

  activeImagePanelId: (state: ViewerStore) => state.imagePanelIndex,
  setActiveImagePanelId: (state: ViewerStore) => state.setActiveImagePanelId,

  cursorPosition: (state: ViewerStore) => state.cursorPosition,
  setCursorPosition: (state: ViewerStore) => state.setCursorPosition,

  /* Channels State Management */
  setActiveChannelsStateIndex: (state: ViewerStore) =>
    state.setActiveChannelsStateIndex,
  activeChannelsStateIndex: (state: ViewerStore) =>
    state.imagePanels[state.imagePanelIndex],

  /* Layers */
  layersState: (state: ViewerStore) => {
    const channelsStateIndex = state.imagePanels[state.imagePanelIndex];
    return state.layersStates[channelsStateIndex];
  },

  /* Channels */
  channelsState: (state: ViewerStore) => {
    const layerState = select.layersState(state);
    return layerState?.channels;
  },
  channelIds: (state: ViewerStore) => {
    const layerState = select.layersState(state);
    return layerState?.channelIds ?? EMPTY_ARRAY;
  },
  maxChannelDomain: (state: ViewerStore) => {
    const channelsState = select.channelsState(state);
    const channelIds = select.channelIds(state);
    return Math.max(...channelIds.map((id) => channelsState?.[id]?.domain[1] ?? 0));
  },
  visibleChannelCount: (state: ViewerStore) => {
    const channelsState = select.channelsState(state);
    const channelIds = select.channelIds(state);
    return channelIds.filter((id) => channelsState?.[id]?.isVisible).length;
  },
  /* Overlays */
  overlaysStates: (state: ViewerStore) => {
    const layerState = select.layersState(state);
    const overlaysState = layerState?.overlays ?? EMPTY_OBJECT;
    return overlaysState;
  },

  layersStates: (state: ViewerStore) => state.layersStates,

  addChannelsState: (state: ViewerStore) => state.addChannelsState,
  removeChannelsState: (state: ViewerStore) => state.removeChannelsState,

  addImagePanel: (state: ViewerStore) => state.addImagePanel,
  removeImagePanel: (state: ViewerStore) => state.removeImagePanel,

  setContrastLimits: (state: ViewerStore) => state.setContrastLimits,
  setChannelVisibility: (state: ViewerStore) => state.setChannelVisibility,
  setChannelColor: (state: ViewerStore) => state.setChannelColor,

  /* Channels > Selected */
  selectedChannelId: (state: ViewerStore) =>
    state.selectedChannelId as keyof ChannelsStateColumns | null,
  setSelectedChannelId: (state: ViewerStore) => state.setSelectedChannelId,
  selectedChannel: (state: ViewerStore): ChannelConfig | null => {
    const selectedChannelId = select.selectedChannelId(state);
    const channelsState = select.channelsState(state);
    const channelConfig = channelsState?.[selectedChannelId!];
    return channelConfig ?? null;
  },

  addOverlaysState: (state: ViewerStore) => state.addOverlaysState,
  updateOverlaysState: (state: ViewerStore) => state.updateOverlaysState,
  removeOverlaysState: (state: ViewerStore) => state.removeOverlaysState,
  setMarkerVisibility: (state: ViewerStore) => state.setMarkerVisibility,
  setMarkerColor: (state: ViewerStore) => state.setMarkerColor,

  overlaysFillOpacity: (state: ViewerStore) => {
    const layerState = select.layersState(state);
    return layerState?.overlaysFillOpacity ?? 0.8;
  },
  setOverlaysFillOpacity: (state: ViewerStore) => state.setOverlaysFillOpacity,

  channelsOpacity: (state: ViewerStore) => {
    const layerState = select.layersState(state);
    return layerState?.channelsOpacity ?? 1;
  },
  setChannelsOpacity: (state: ViewerStore) => state.setChannelsOpacity,

  showCellOutline: (state: ViewerStore) => {
    const layerState = select.layersState(state);
    return layerState?.showCellOutline ?? true;
  },
  setShowCellOutline: (state: ViewerStore) => state.setShowCellOutline,

  currentZoom: (state: ViewerStore) => state.viewStateActive?.zoom ?? 0,
};
