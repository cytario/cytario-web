import { castDraft } from "immer";
import { createStore } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import { getInitialChannelsState } from "./getInitialChannelsState";
import {
  ByteDomain,
  ChannelsState,
  ChannelsStateColumns,
  RGBA,
  OverlaysState,
  OverlayState,
  ViewerStore,
  ViewState,
  RGB,
} from "./types";
import { getSelectionStats } from "../utils/getSelectionStats";

/**
 * Creates a Zustand store for managing the state of an image viewer instance.
 *
 * The store handles:
 * - Image loading and metadata management
 * - Multi-panel views with independent layer states
 * - Channel visibility, colors, and contrast limits
 * - Overlay management for cell segmentation data
 * - View state (zoom, pan) with persistence
 *
 * Uses Zustand middlewares:
 * - `persist`: Persists selected state to localStorage
 * - `immer`: Enables immutable state updates with mutable syntax
 * - `devtools`: Enables Redux DevTools integration for debugging
 *
 * @param id - Unique identifier for the viewer instance, used for persistence key and devtools name
 * @returns A Zustand store instance with the complete ViewerStore interface
 *
 */
export const createViewerStore = (id: string) =>
  createStore<ViewerStore>()(
    persist(
      immer(
        devtools(
          (set, get) => ({
            id,

            error: null,
            selectedChannelId: null,

            loader: [],

            isViewerLoading: true,

            metadata: null,
            viewStatePreview: null,
            viewStateActive: null,

            imagePanelIndex: -1,
            imagePanels: [],

            cursorPosition: null,

            layersStates: [],

            setError: (error: Error | null) =>
              set(
                (state) => {
                  state.error = error;
                },
                false,
                "setError"
              ),

            setCursorPosition: (cursorPosition) =>
              set(
                (state) => ({ ...state, cursorPosition }),
                false,
                "setCursorPosition"
              ),

            setViewStatePreview: (viewStatePreview: ViewState) =>
              set(
                (state) => {
                  state.viewStatePreview = viewStatePreview;
                },
                false,
                "setViewStatePreview"
              ),

            setViewStateActive: (viewStateActive: ViewState) =>
              set(
                (state) => {
                  state.viewStateActive = viewStateActive;
                  state.viewStateActive.minZoom = -(state.loader?.length ?? 0);
                  state.viewStateActive.maxZoom = 2;
                },
                false,
                "setViewStateActive"
              ),

            setIsViewerLoading: (isViewerLoading: boolean) =>
              set(
                (state) => {
                  state.isViewerLoading = isViewerLoading;
                },
                false,
                "setIsViewerLoading"
              ),

            setIsChannelsLoading: (imagePanelId: number, count: number) =>
              set(
                (state) => {
                  const layersStateIndex = state.imagePanels[imagePanelId];
                  const layerState = state.layersStates[layersStateIndex];
                  if (layerState) {
                    layerState.isChannelsLoading = count;
                  }
                },
                false,
                "setIsChannelsLoading"
              ),

            setIsOverlaysLoading: (imagePanelId: number, count: number) =>
              set(
                (state) => {
                  const layersStateIndex = state.imagePanels[imagePanelId];
                  const layerState = state.layersStates[layersStateIndex];
                  if (layerState) {
                    layerState.isOverlaysLoading = count;
                  }
                },
                false,
                "setIsOverlaysLoading"
              ),

            setMetadata: (metadata) =>
              set(
                (state) => {
                  state.metadata = metadata;
                },
                false,
                "setMetadata"
              ),

            setLoader: (loader) =>
              set(
                (state) => {
                  state.loader = loader;
                },
                false,
                "setLoader"
              ),

            setSelectedChannelId: (selectedChannelId) =>
              set(
                (state) => {
                  state.selectedChannelId = selectedChannelId;
                },
                false,
                "setSelectedChannelId"
              ),

            setActiveImagePanelId: (imagePanelIndex) =>
              set(
                (state) => {
                  state.imagePanelIndex = imagePanelIndex;
                },
                false,
                "setActiveImagePanelId"
              ),

            addImagePanel: () =>
              set(
                (state) => {
                  const newPanelIndex = state.imagePanels.length;
                  state.imagePanels.push(newPanelIndex);

                  // If we don't have enough layersStates, duplicate the last one
                  while (state.layersStates.length < state.imagePanels.length) {
                    const lastLayersState =
                      state.layersStates[state.layersStates.length - 1];
                    state.layersStates.push({ ...lastLayersState });
                  }
                },
                false,
                "addImagePanel"
              ),

            addChannelsState: async () => {
              const state = get();
              if (!state.metadata || !state.loader) return;

              if (state.imagePanelIndex < 0) {
                try {
                  // Create a timeout promise to prevent infinite hanging
                  const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => {
                      reject(
                        new Error(
                          "Worker initialization timeout after 10 seconds. The decoder worker may not be loaded correctly."
                        )
                      );
                    }, 10000);
                  });

                  // Race between actual initialization and timeout
                  const { channelsState, channelIds, firstChannelKey } =
                    await Promise.race([
                      getInitialChannelsState(state.metadata, state.loader),
                      timeoutPromise,
                    ]);

                  return set(
                    (state) => {
                      state.imagePanelIndex = 0;
                      state.imagePanels = [0];
                      state.selectedChannelId = firstChannelKey;
                      state.layersStates = [
                        {
                          channels: castDraft(channelsState),
                          channelIds,
                          overlays: {},
                          channelsOpacity: 1,
                          overlaysFillOpacity: 0.8,
                          showCellOutline: true,
                          isChannelsLoading: 0,
                          isOverlaysLoading: 0,
                        },
                      ];
                    },
                    false,
                    "addChannelsStateInitial"
                  );
                } catch (error) {
                  console.error(
                    "[createViewerStore] addChannelsState - FAILED:",
                    error
                  );
                  // Set error state so the UI can show an error message instead of hanging
                  set(
                    (state) => {
                      state.error =
                        error instanceof Error
                          ? error
                          : new Error(String(error));
                    },
                    false,
                    "addChannelsStateError"
                  );
                  return;
                }
              }

              const activeImagePanelIndex =
                state.imagePanels[state.imagePanelIndex];

              return set(
                (draft) => {
                  draft.imagePanels = draft.imagePanels.map(
                    (imagePanelIndex, index) => {
                      if (index === draft.imagePanelIndex) {
                        return draft.layersStates.length;
                      }
                      return imagePanelIndex;
                    }
                  );
                  draft.layersStates.push(
                    castDraft(state.layersStates[activeImagePanelIndex])
                  );
                },
                false,
                "addChannelsStateDuplicate"
              );
            },

            removeChannelsState: (i) =>
              set(
                (state) => {
                  state.imagePanels = state.imagePanels.map((imagePanelIndex) =>
                    Math.min(imagePanelIndex, state.layersStates.length - 2)
                  );
                  state.layersStates = state.layersStates.filter(
                    (_, index) => index !== i
                  );
                },
                false,
                "removeChannelsState"
              ),

            setActiveChannelsStateIndex: (channelsStateIndex: number) =>
              set(
                (state) => {
                  // If we don't have enough layersStates, duplicate the last one
                  while (state.layersStates.length < channelsStateIndex + 1) {
                    const lastLayersState =
                      state.layersStates[state.layersStates.length - 1];
                    state.layersStates.push({ ...lastLayersState });
                  }

                  state.imagePanels = state.imagePanels.map(
                    (imagePanel, index) => {
                      if (index === state.imagePanelIndex) {
                        return channelsStateIndex;
                      }
                      return imagePanel;
                    }
                  );
                },
                false,
                "setActiveChannelsStateIndex"
              ),

            removeImagePanel: (imagePanelIndex) =>
              set(
                (state) => {
                  state.imagePanelIndex = imagePanelIndex - 1;
                  state.imagePanels = state.imagePanels.filter(
                    (_, index) => index !== imagePanelIndex
                  );
                },
                false,
                "removeImagePanel"
              ),

            setContrastLimits: (contrastLimits) =>
              set(
                (state) => {
                  const activeChannelsStateIndex =
                    state.imagePanels[state.imagePanelIndex];

                  const key =
                    state.selectedChannelId as keyof ChannelsStateColumns;

                  if (
                    state.layersStates[activeChannelsStateIndex]?.channels[key]
                  ) {
                    state.layersStates[activeChannelsStateIndex].channels[
                      key
                    ].contrastLimits = contrastLimits;
                  }
                },
                false,
                "setContrastLimits"
              ),

            resetContrastLimits: () =>
              set(
                (state) => {
                  const activeChannelsStateIndex =
                    state.imagePanels[state.imagePanelIndex];

                  const key =
                    state.selectedChannelId as keyof ChannelsStateColumns;

                  const channel =
                    state.layersStates[activeChannelsStateIndex]?.channels[key];

                  if (channel) {
                    channel.contrastLimits =
                      channel.contrastLimitsInitial as ByteDomain;
                  }
                },
                false,
                "resetContrastLimits"
              ),

            /**
             * Sets the visibility of a channel in the active image panel.
             * If the channel is not initialized, it loads stats and initializes it before setting visibility.
             * Updates the store state accordingly.
             */
            setChannelVisibility: async (
              key: keyof ChannelsState,
              isVisible: boolean
            ) => {
              const state = get();

              if (!state.loader || state.imagePanelIndex < 0) return;

              const activeChannelsStateIndex =
                state.imagePanels[state.imagePanelIndex];

              const activeChannelsStateConfig =
                state.layersStates[activeChannelsStateIndex].channels[key];

              // If the channel is not initialized, we need to load stats first
              if (!activeChannelsStateConfig.isInitialized) {
                set(
                  (state) => {
                    state.layersStates[activeChannelsStateIndex].channels[
                      key
                    ].isLoading = true;
                  },
                  false,
                  "setChannelVisibility/stats/request"
                );

                try {
                  const { domain, contrastLimits, histogram } =
                    await getSelectionStats({
                      loader: state.loader,
                      selection: activeChannelsStateConfig.selection,
                    });

                  return set(
                    (state) => {
                      const channel =
                        state.layersStates[activeChannelsStateIndex].channels[
                          key
                        ];
                      channel.isInitialized = true;
                      channel.isLoading = false;
                      channel.domain = castDraft(domain);
                      channel.contrastLimits = contrastLimits;
                      channel.contrastLimitsInitial = castDraft(contrastLimits);
                      channel.histogram = castDraft(histogram);
                      channel.isVisible = isVisible;
                    },
                    false,
                    "setChannelVisibility/stats/success"
                  );
                } catch {
                  return set(
                    (state) => {
                      const channel =
                        state.layersStates[activeChannelsStateIndex].channels[
                          key
                        ];
                      channel.isLoading = false;
                      channel.isVisible = false;
                    },
                    false,
                    "setChannelVisibility/stats/error"
                  );
                }
              }

              set(
                (state) => {
                  state.layersStates[activeChannelsStateIndex].channels[
                    key
                  ].isVisible = isVisible;
                },
                false,
                "setChannelVisibility"
              );
            },

            setMarkerVisibility: (
              fileName: string,
              markerName: string,
              isVisible: boolean
            ) =>
              set(
                (state) => {
                  const activeImagePanelIndex =
                    state.imagePanels[state.imagePanelIndex];
                  const overlays =
                    state.layersStates[activeImagePanelIndex]?.overlays;

                  if (overlays?.[fileName]?.[markerName]) {
                    overlays[fileName][markerName].isVisible = isVisible;
                  }
                },
                false,
                "setMarkerVisibility"
              ),

            setChannelColor: (key: keyof ChannelsState, color: RGBA) =>
              set(
                (state) => {
                  const activeChannelsStateIndex =
                    state.imagePanels[state.imagePanelIndex];
                  const channel =
                    state.layersStates[activeChannelsStateIndex]?.channels[key];

                  if (channel) {
                    channel.color = color.slice(0, 3) as RGB;
                  }
                },
                false,
                "setChannelColor"
              ),

            setMarkerColor: (
              fileName: string,
              markerName: string,
              color: RGBA
            ) =>
              set(
                (state) => {
                  const activeImagePanelIndex =
                    state.imagePanels[state.imagePanelIndex];
                  const overlays =
                    state.layersStates[activeImagePanelIndex]?.overlays;

                  if (overlays?.[fileName]?.[markerName]) {
                    overlays[fileName][markerName].color = color;
                  }
                },
                false,
                "setMarkerColor"
              ),

            addOverlaysState: (overlaysState: OverlaysState) =>
              set(
                (state) => {
                  const activeImagePanelIndex =
                    state.imagePanels[state.imagePanelIndex];
                  const layerState = state.layersStates[activeImagePanelIndex];

                  if (layerState) {
                    Object.assign(layerState.overlays, overlaysState);
                  }
                },
                false,
                "addOverlaysState"
              ),

            updateOverlaysState: (
              overlayId: string,
              overlayState: OverlayState
            ) =>
              set(
                (state) => {
                  const activeImagePanelIndex =
                    state.imagePanels[state.imagePanelIndex];
                  const layerState = state.layersStates[activeImagePanelIndex];

                  if (layerState?.overlays[overlayId]) {
                    layerState.overlays[overlayId] = overlayState;
                  }
                },
                false,
                "updateOverlaysState"
              ),

            removeOverlaysState: (overlaysStateId: string) =>
              set(
                (state) => {
                  const activeImagePanelIndex =
                    state.imagePanels[state.imagePanelIndex];
                  const overlays =
                    state.layersStates[activeImagePanelIndex]?.overlays;

                  if (overlays) {
                    delete overlays[overlaysStateId];
                  }
                },
                false,
                "removeOverlaysState"
              ),

            setOverlaysFillOpacity: (fillOpacity: number) =>
              set(
                (state) => {
                  const activeImagePanelIndex =
                    state.imagePanels[state.imagePanelIndex];
                  const layerState = state.layersStates[activeImagePanelIndex];

                  if (layerState) {
                    layerState.overlaysFillOpacity = fillOpacity;
                  }
                },
                false,
                "setOverlaysFillOpacity"
              ),

            setChannelsOpacity: (channelsOpacity: number) =>
              set(
                (state) => {
                  const activeImagePanelIndex =
                    state.imagePanels[state.imagePanelIndex];
                  const layerState = state.layersStates[activeImagePanelIndex];

                  if (layerState) {
                    layerState.channelsOpacity = channelsOpacity;
                  }
                },
                false,
                "setChannelsOpacity"
              ),

            setShowCellOutline: (showCellOutline: boolean) =>
              set(
                (state) => {
                  const activeImagePanelIndex =
                    state.imagePanels[state.imagePanelIndex];
                  const layerState = state.layersStates[activeImagePanelIndex];

                  if (layerState) {
                    layerState.showCellOutline = showCellOutline;
                  }
                },
                false,
                "setShowCellOutline"
              ),
          }),
          {
            name: "ViewerStore-" + id,
          }
        )
      ),
      {
        name: "ViewerStore-" + id,
        partialize: (state) => ({
          selectedChannelId: state.selectedChannelId,
          imagePanelIndex: state.imagePanelIndex,
          imagePanels: state.imagePanels,
          layersStates: state.layersStates,
          viewStateActive: state.viewStateActive,
        }),
      }
    )
  );
