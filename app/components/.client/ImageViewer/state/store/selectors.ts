import type { Loader } from "./core/ome.tif.types";
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
import { DEFAULT_OVERLAYS_FILL_OPACITY } from "~/utils/overlayDefaults";

const EMPTY_OBJECT = Object.freeze({});

/** Deepest integer zoom-out that still shows the whole base level. Shallow
 *  pyramids (few levels, huge base) need more headroom than `-levels`, so
 *  derive from the base dimensions vs tile size and fall back to `-levels`
 *  when the shape/labels/tileSize are unavailable. */
export const fitMinZoom = (loader: Loader | null | undefined): number => {
  const fallback = loader?.length ? -loader.length : 0;
  const base = loader?.[0];
  if (!base) return fallback;
  const yIndex = base.labels?.indexOf("y") ?? -1;
  const xIndex = base.labels?.indexOf("x") ?? -1;
  if (yIndex < 0 || xIndex < 0 || !base.tileSize) return fallback;
  const maxDimension = Math.max(base.shape[yIndex] ?? 0, base.shape[xIndex] ?? 0);
  if (!maxDimension) return fallback;
  return -Math.ceil(Math.log2(maxDimension / base.tileSize));
};

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

  loader: (state: ViewerStore) => state.loader,
  valueRange: (state: ViewerStore) => state.valueRange,

  metadata: (state: ViewerStore) => state.metadata,

  minZoom: (state: ViewerStore) => fitMinZoom(state.loader),
  maxZoom: () => 2,

  viewStatePreview: (state: ViewerStore) => state.viewStatePreview,
  setViewStatePreview: (state: ViewerStore) => state.setViewStatePreview,

  viewStateActive: (state: ViewerStore) => state.viewStateActive,
  setViewStateActive: (state: ViewerStore) => state.setViewStateActive,

  setIsChannelsLoading: (state: ViewerStore) => state.setIsChannelsLoading,
  setIsOverlaysLoading: (state: ViewerStore) => state.setIsOverlaysLoading,

  activeImagePanelId: (state: ViewerStore) => state.imagePanelIndex,
  setActiveImagePanelId: (state: ViewerStore) => state.setActiveImagePanelId,

  cursorPosition: (state: ViewerStore) => state.cursorPosition,
  setCursorPosition: (state: ViewerStore) => state.setCursorPosition,

  pixelValues: (state: ViewerStore) => state.pixelValues,
  setPixelValues: (state: ViewerStore) => state.setPixelValues,
  clearPixelValues: (state: ViewerStore) => state.clearPixelValues,

  setActivePresetIndex: (state: ViewerStore) => state.setActivePresetIndex,
  setViewName: (state: ViewerStore) => state.setViewName,
  activePresetIndex: (state: ViewerStore) => state.imagePanels[state.imagePanelIndex],
  /** Stable id of the layersState the focused panel shows — collection items
   *  (view radios) must key off this, not off positional indices, or
   *  react-aria throws "Cannot change the id of an item" when views are
   *  removed. */
  activeLayersStateId: (state: ViewerStore) =>
    state.layersStates[state.imagePanels[state.imagePanelIndex]]?.id ?? "",

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

  sharedViewsLoaded: (state: ViewerStore) => state.sharedViewsLoaded,

  addChannelsState: (state: ViewerStore) => state.addChannelsState,
  removeChannelsState: (state: ViewerStore) => state.removeChannelsState,

  addImagePanel: (state: ViewerStore) => state.addImagePanel,
  removeImagePanel: (state: ViewerStore) => state.removeImagePanel,

  setContrastLimits: (state: ViewerStore) => state.setContrastLimits,
  setChannelVisibility: (state: ViewerStore) => state.setChannelVisibility,
  setChannelColor: (state: ViewerStore) => state.setChannelColor,

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
  updateOverlayConfig: (state: ViewerStore) => state.updateOverlayConfig,
  removeOverlaysState: (state: ViewerStore) => state.removeOverlaysState,
  setMarkerVisibility: (state: ViewerStore) => state.setMarkerVisibility,
  setMarkerColor: (state: ViewerStore) => state.setMarkerColor,

  overlaysFillOpacity: (state: ViewerStore) => {
    const layerState = getLayersState(state);
    return layerState?.overlaysFillOpacity ?? DEFAULT_OVERLAYS_FILL_OPACITY;
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

  compositeTooltip: (state: ViewerStore) => state.compositeTooltip,
  setCompositeTooltip: (state: ViewerStore) => state.setCompositeTooltip,
  hoverMode: (state: ViewerStore) => state.hoverMode,
  setHoverMode: (state: ViewerStore) => state.setHoverMode,
  pinnedTooltip: (state: ViewerStore) => state.pinnedTooltip,
  pinTooltip: (state: ViewerStore) => state.pinTooltip,
  unpinTooltip: (state: ViewerStore) => state.unpinTooltip,
};
