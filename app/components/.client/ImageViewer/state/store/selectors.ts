import {
  BRIGHTFIELD_GROUP_ID,
  BrightfieldGroup,
  ByteDomain,
  ChannelConfig,
  ChannelsState,
  ChannelsStateColumns,
  detectBrightfieldGroup,
  LayerChannelsState,
  ViewerStore,
} from "./types";

const EMPTY_OBJECT = Object.freeze({});

// Referential-stability caches: zustand compares selector results with
// Object.is, so returning a new object each call triggers re-renders.
let _bfGroupCache: { ids: readonly string[]; result: BrightfieldGroup | null } | null = null;
let _bfSelectedCache: {
  r: ChannelConfig;
  g: ChannelConfig;
  b: ChannelConfig;
  result: ChannelConfig;
} | null = null;
// Keyed by `layerChannels` ref so concurrent panels/presets don't thrash.
const _mergedCacheMap = new Map<
  LayerChannelsState | undefined,
  { topLevel: ChannelsState; channelIds: readonly string[]; result: ChannelsState | undefined }
>();

/** Merge per-panel layer channels with top-level (image-derived) channels. */
export const resolveChannelsState = (
  topLevel: ChannelsState,
  layerChannels: LayerChannelsState | undefined,
  channelIds: readonly string[],
): ChannelsState | undefined => {
  if (!layerChannels) return undefined;

  const cached = _mergedCacheMap.get(layerChannels);
  if (cached && cached.topLevel === topLevel && cached.channelIds === channelIds) {
    return cached.result;
  }

  const merged: ChannelsState = {};
  for (const key of channelIds) {
    const tc = topLevel[key];
    if (!tc) continue;
    const lc = layerChannels[key];
    merged[key] = {
      isVisible: lc?.isVisible ?? false,
      contrastLimits: lc?.contrastLimits ?? tc.contrastLimits,
      color: lc?.color ?? tc.color,
      histogram: tc.histogram,
      domain: tc.domain,
      selection: tc.selection,
      isInitialized: tc.isInitialized,
      isLoading: tc.isLoading,
    };
  }

  _mergedCacheMap.set(layerChannels, { topLevel, channelIds, result: merged });
  return merged;
};
/** Resolve the layersState for the active panel — private helper, not
 *  exported via `select`.  Callers that need the layersState for a specific
 *  panel should use `channelsStateForPanel` or access `state.layersStates`
 *  directly. */
const getLayersState = (state: ViewerStore) => {
  const channelsStateIndex = state.imagePanels[state.imagePanelIndex];
  return state.layersStates[channelsStateIndex];
};

/** Factory: resolve the merged channelsState for a specific image panel.
 *  Returns a selector suitable for `useViewerStore(...)`. */
export const channelsStateForPanel =
  (panelId: number) =>
  (state: ViewerStore): ChannelsState | undefined => {
    const channelsStateIndex = state.imagePanels[panelId];
    const layerState = state.layersStates[channelsStateIndex];
    return resolveChannelsState(state.channels, layerState?.channels, state.channelIds);
  };

/** Factory: resolve the merged channelsState for a specific preset (index
 *  into `layersStates`).  Returns a selector suitable for `useViewerStore(...)`. */
export const channelsStateForLayer =
  (layerIndex: number) =>
  (state: ViewerStore): ChannelsState | undefined => {
    const layerState = state.layersStates[layerIndex];
    return resolveChannelsState(state.channels, layerState?.channels, state.channelIds);
  };

export const select = {
  error: (state: ViewerStore) => state.error,

  isViewerLoading: (state: ViewerStore) => state.isViewerLoading,

  /* Loader */
  loader: (state: ViewerStore) => state.loader,
  valueRange: (state: ViewerStore) => state.valueRange,

  /* Metadata */
  metadata: (state: ViewerStore) => state.metadata,

  minZoom: (state: ViewerStore) => -(state.loader?.length ?? 0),
  maxZoom: () => 2,

  /* View State Preview */
  viewStatePreview: (state: ViewerStore) => state.viewStatePreview,
  setViewStatePreview: (state: ViewerStore) => state.setViewStatePreview,

  /* View State Active */
  viewStateActive: (state: ViewerStore) => state.viewStateActive,
  setViewStateActive: (state: ViewerStore) => state.setViewStateActive,

  /* Tile Loading (per panel) */
  setIsChannelsLoading: (state: ViewerStore) => state.setIsChannelsLoading,
  setIsOverlaysLoading: (state: ViewerStore) => state.setIsOverlaysLoading,

  activeImagePanelId: (state: ViewerStore) => state.imagePanelIndex,
  setActiveImagePanelId: (state: ViewerStore) => state.setActiveImagePanelId,

  cursorPosition: (state: ViewerStore) => state.cursorPosition,
  setCursorPosition: (state: ViewerStore) => state.setCursorPosition,

  pixelValues: (state: ViewerStore) => state.pixelValues,
  setPixelValues: (state: ViewerStore) => state.setPixelValues,

  /* Preset Management */
  setActivePresetIndex: (state: ViewerStore) => state.setActivePresetIndex,
  setViewName: (state: ViewerStore) => state.setViewName,
  activePresetIndex: (state: ViewerStore) => state.imagePanels[state.imagePanelIndex],

  /* Channels */
  channelsState: (state: ViewerStore): ChannelsState | undefined => {
    const layerState = getLayersState(state);
    return resolveChannelsState(state.channels, layerState?.channels, state.channelIds);
  },
  channelIds: (state: ViewerStore) => state.channelIds,
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
  brightfieldGroup: (state: ViewerStore): BrightfieldGroup | null => {
    const channelIds = select.channelIds(state);
    if (_bfGroupCache && _bfGroupCache.ids === channelIds) return _bfGroupCache.result;
    const result = detectBrightfieldGroup(channelIds);
    _bfGroupCache = { ids: channelIds, result };
    return result;
  },
  /* Overlays */
  overlaysStates: (state: ViewerStore) => {
    const layerState = getLayersState(state);
    const overlaysState = layerState?.overlays ?? EMPTY_OBJECT;
    return overlaysState;
  },

  layersStates: (state: ViewerStore) => state.layersStates,
  viewName:
    (layerIndex: number) =>
    (state: ViewerStore): string => {
      const entry = state.layersStates[layerIndex];
      if (entry?.name) return entry.name;
      const merged = resolveChannelsState(state.channels, entry?.channels, state.channelIds);
      const visible = state.channelIds.filter((id) => merged?.[id]?.isVisible);
      return visible.length > 0 ? visible.join(", ") : "No channels";
    },

  addChannelsState: (state: ViewerStore) => state.addChannelsState,
  removeChannelsState: (state: ViewerStore) => state.removeChannelsState,

  addImagePanel: (state: ViewerStore) => state.addImagePanel,
  removeImagePanel: (state: ViewerStore) => state.removeImagePanel,

  setContrastLimits: (state: ViewerStore) => state.setContrastLimits,
  setChannelVisibility: (state: ViewerStore) => state.setChannelVisibility,
  setChannelColor: (state: ViewerStore) => state.setChannelColor,

  /* Channels > Selected */
  selectedChannelId: (state: ViewerStore) =>
    state.selectedChannelId as keyof ChannelsStateColumns | typeof BRIGHTFIELD_GROUP_ID | null,
  setSelectedChannelId: (state: ViewerStore) => state.setSelectedChannelId,
  selectedChannel: (state: ViewerStore): ChannelConfig | null => {
    const selectedChannelId = select.selectedChannelId(state);
    const channelsState = select.channelsState(state);

    if (selectedChannelId === BRIGHTFIELD_GROUP_ID) {
      const group = select.brightfieldGroup(state);
      if (!group || !channelsState) return null;
      const r = channelsState[group.red];
      const g = channelsState[group.green];
      const b = channelsState[group.blue];
      if (!r || !g || !b) return null;

      if (_bfSelectedCache?.r === r && _bfSelectedCache?.g === g && _bfSelectedCache?.b === b) {
        return _bfSelectedCache.result;
      }

      // Synthesize from green channel as representative, with union domain.
      const domainMin = Math.min(r.domain[0], g.domain[0], b.domain[0]);
      const domainMax = Math.max(r.domain[1], g.domain[1], b.domain[1]);

      const result: ChannelConfig = {
        ...g,
        color: [200, 200, 200],
        domain: [domainMin, domainMax],
        contrastLimits: g.contrastLimits,
        isVisible: r.isVisible && g.isVisible && b.isVisible,
        isLoading: r.isLoading || g.isLoading || b.isLoading,
        isInitialized: r.isInitialized && g.isInitialized && b.isInitialized,
      };
      _bfSelectedCache = { r, g, b, result };
      return result;
    }

    const channelConfig = channelsState?.[selectedChannelId!];
    return channelConfig ?? null;
  },

  /** Pristine default contrast limits from top-level `channels`. */
  defaultContrastLimits: (state: ViewerStore): ByteDomain | null => {
    const selectedChannelId = select.selectedChannelId(state);
    if (!selectedChannelId) return null;

    if (selectedChannelId === BRIGHTFIELD_GROUP_ID) {
      const group = select.brightfieldGroup(state);
      if (!group) return null;
      return state.channels[group.green]?.contrastLimits ?? null;
    }

    return state.channels[selectedChannelId as string]?.contrastLimits ?? null;
  },

  addOverlaysState: (state: ViewerStore) => state.addOverlaysState,
  updateOverlaysState: (state: ViewerStore) => state.updateOverlaysState,
  removeOverlaysState: (state: ViewerStore) => state.removeOverlaysState,
  setMarkerVisibility: (state: ViewerStore) => state.setMarkerVisibility,
  setMarkerColor: (state: ViewerStore) => state.setMarkerColor,

  overlaysFillOpacity: (state: ViewerStore) => {
    const layerState = getLayersState(state);
    return layerState?.overlaysFillOpacity ?? 0.8;
  },
  setOverlaysFillOpacity: (state: ViewerStore) => state.setOverlaysFillOpacity,

  channelsOpacity: (state: ViewerStore) => {
    const layerState = getLayersState(state);
    return layerState?.channelsOpacity ?? 1;
  },
  setChannelsOpacity: (state: ViewerStore) => state.setChannelsOpacity,

  showCellOutline: (state: ViewerStore) => {
    const layerState = getLayersState(state);
    return layerState?.showCellOutline ?? true;
  },
  setShowCellOutline: (state: ViewerStore) => state.setShowCellOutline,

  annotationsOpacity: (state: ViewerStore) => {
    const layerState = getLayersState(state);
    return layerState?.annotationsOpacity ?? 1;
  },
  setAnnotationsOpacity: (state: ViewerStore) => state.setAnnotationsOpacity,

  showAnnotationOutline: (state: ViewerStore) => {
    const layerState = getLayersState(state);
    return layerState?.showAnnotationOutline ?? true;
  },
  setShowAnnotationOutline: (state: ViewerStore) => state.setShowAnnotationOutline,

  currentZoom: (state: ViewerStore) => state.viewStateActive?.zoom ?? 0,
};
