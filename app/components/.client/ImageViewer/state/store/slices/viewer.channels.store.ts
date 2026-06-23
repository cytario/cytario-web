import { castDraft } from "immer";

import { getSelectionStats } from "../../../utils/getSelectionStats";
import { getInitialChannelsState } from "../getInitialChannelsState";
import {
  BRIGHTFIELD_GROUP_ID,
  ByteDomain,
  ChannelsState,
  ChannelsStateColumns,
  detectBrightfieldGroup,
  OverlaysState,
  RGB,
  RGBA,
  ViewerSlice,
} from "../types";

export interface ChannelsSlice {
  selectedChannelId: keyof ChannelsState | null;
  imagePanelIndex: number;
  imagePanels: number[];
  layersStates: {
    channels: ChannelsState;
    channelIds: string[];
    overlays: OverlaysState;
    channelsOpacity: number;
    overlaysFillOpacity: number;
    showCellOutline: boolean;
    isChannelsLoading: number;
    isOverlaysLoading: number;
  }[];

  setIsChannelsLoading: (imagePanelId: number, count: number) => void;
  setSelectedChannelId: (selectedChannelId: keyof ChannelsState | null) => void;
  setActiveImagePanelId: (imagePanelIndex: number) => void;
  addImagePanel: () => void;
  addChannelsState: () => void;
  removeChannelsState: (channelsStateIndex: number) => void;
  setActiveChannelsStateIndex: (channelsStateIndex: number) => void;
  removeImagePanel: (index: number) => void;
  setContrastLimits: (contrastLimits: ByteDomain) => void;
  resetContrastLimits: () => void;
  setChannelVisibility: (key: keyof ChannelsStateColumns, isVisible: boolean) => void;
  setChannelColor: (key: keyof ChannelsState, color: RGBA) => void;
  setChannelsOpacity: (opacity: number) => void;
}

/**
 * Channels + image-panel layer state: the per-panel `layersStates` array, the
 * active panel/channel selection, channel init (stats/histogram), contrast,
 * colors, and visibility (incl. brightfield R/G/B grouping).
 */
export const createChannelsSlice: ViewerSlice<ChannelsSlice> = (set, get) => ({
  selectedChannelId: null,
  imagePanelIndex: -1,
  imagePanels: [],
  layersStates: [],

  setIsChannelsLoading: (imagePanelId, count) =>
    set(
      (state) => {
        const layersStateIndex = state.imagePanels[imagePanelId];
        const layerState = state.layersStates[layersStateIndex];
        if (layerState) {
          layerState.isChannelsLoading = count;
        }
      },
      false,
      "setIsChannelsLoading",
    ),

  setSelectedChannelId: (selectedChannelId) =>
    set(
      (state) => {
        state.selectedChannelId = selectedChannelId;
      },
      false,
      "setSelectedChannelId",
    ),

  setActiveImagePanelId: (imagePanelIndex) =>
    set(
      (state) => {
        state.imagePanelIndex = imagePanelIndex;
      },
      false,
      "setActiveImagePanelId",
    ),

  addImagePanel: () =>
    set(
      (state) => {
        const newPanelIndex = state.imagePanels.length;
        state.imagePanels.push(newPanelIndex);

        // If we don't have enough layersStates, duplicate the last one
        while (state.layersStates.length < state.imagePanels.length) {
          const lastLayersState = state.layersStates[state.layersStates.length - 1];
          state.layersStates.push({ ...lastLayersState });
        }
      },
      false,
      "addImagePanel",
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
                "Worker initialization timeout after 10 seconds. The decoder worker may not be loaded correctly.",
              ),
            );
          }, 10000);
        });

        // Race between actual initialization and timeout
        const { channelsState, channelIds, firstChannelKey } = await Promise.race([
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
          "addChannelsStateInitial",
        );
      } catch (error) {
        console.error("[createViewerStore] addChannelsState - FAILED:", error);
        // Set error state so the UI can show an error message instead of hanging
        set(
          (state) => {
            state.error = error instanceof Error ? error : new Error(String(error));
          },
          false,
          "addChannelsStateError",
        );
        return;
      }
    }

    const activeImagePanelIndex = state.imagePanels[state.imagePanelIndex];

    return set(
      (draft) => {
        draft.imagePanels = draft.imagePanels.map((imagePanelIndex, index) => {
          if (index === draft.imagePanelIndex) {
            return draft.layersStates.length;
          }
          return imagePanelIndex;
        });
        draft.layersStates.push(castDraft(state.layersStates[activeImagePanelIndex]));
      },
      false,
      "addChannelsStateDuplicate",
    );
  },

  removeChannelsState: (i) =>
    set(
      (state) => {
        state.imagePanels = state.imagePanels.map((imagePanelIndex) =>
          Math.min(imagePanelIndex, state.layersStates.length - 2),
        );
        state.layersStates = state.layersStates.filter((_, index) => index !== i);
      },
      false,
      "removeChannelsState",
    ),

  setActiveChannelsStateIndex: (channelsStateIndex) =>
    set(
      (state) => {
        // If we don't have enough layersStates, duplicate the last one
        while (state.layersStates.length < channelsStateIndex + 1) {
          const lastLayersState = state.layersStates[state.layersStates.length - 1];
          state.layersStates.push({ ...lastLayersState });
        }

        state.imagePanels = state.imagePanels.map((imagePanel, index) => {
          if (index === state.imagePanelIndex) {
            return channelsStateIndex;
          }
          return imagePanel;
        });
      },
      false,
      "setActiveChannelsStateIndex",
    ),

  removeImagePanel: (imagePanelIndex) =>
    set(
      (state) => {
        state.imagePanelIndex = imagePanelIndex - 1;
        state.imagePanels = state.imagePanels.filter((_, index) => index !== imagePanelIndex);
      },
      false,
      "removeImagePanel",
    ),

  setContrastLimits: (contrastLimits) =>
    set(
      (state) => {
        const activeChannelsStateIndex = state.imagePanels[state.imagePanelIndex];
        const layerState = state.layersStates[activeChannelsStateIndex];
        if (!layerState) return;

        if (state.selectedChannelId === BRIGHTFIELD_GROUP_ID) {
          const group = detectBrightfieldGroup(layerState.channelIds);
          if (!group) return;
          for (const key of [group.red, group.green, group.blue]) {
            if (layerState.channels[key]) {
              layerState.channels[key].contrastLimits = contrastLimits;
            }
          }
        } else {
          const key = state.selectedChannelId as keyof ChannelsStateColumns;
          if (layerState.channels[key]) {
            layerState.channels[key].contrastLimits = contrastLimits;
          }
        }
      },
      false,
      "setContrastLimits",
    ),

  resetContrastLimits: () =>
    set(
      (state) => {
        const activeChannelsStateIndex = state.imagePanels[state.imagePanelIndex];
        const layerState = state.layersStates[activeChannelsStateIndex];
        if (!layerState) return;

        if (state.selectedChannelId === BRIGHTFIELD_GROUP_ID) {
          const group = detectBrightfieldGroup(layerState.channelIds);
          if (!group) return;
          for (const key of [group.red, group.green, group.blue]) {
            const channel = layerState.channels[key];
            if (channel) {
              channel.contrastLimits = channel.contrastLimitsInitial as ByteDomain;
            }
          }
        } else {
          const key = state.selectedChannelId as keyof ChannelsStateColumns;
          const channel = layerState.channels[key];
          if (channel) {
            channel.contrastLimits = channel.contrastLimitsInitial as ByteDomain;
          }
        }
      },
      false,
      "resetContrastLimits",
    ),

  /**
   * Sets the visibility of a channel in the active image panel.
   * If the channel is not initialized, it loads stats and initializes it before setting visibility.
   * Handles BRIGHTFIELD_GROUP_ID by toggling all R/G/B channels together.
   */
  setChannelVisibility: async (key: keyof ChannelsState, isVisible: boolean) => {
    const state = get();

    if (!state.loader || state.imagePanelIndex < 0) return;

    const activeChannelsStateIndex = state.imagePanels[state.imagePanelIndex];
    const layerState = state.layersStates[activeChannelsStateIndex];

    // Brightfield group: toggle all 3 channels
    if (key === BRIGHTFIELD_GROUP_ID) {
      const group = detectBrightfieldGroup(layerState.channelIds);
      if (!group) return;
      const keys = [group.red, group.green, group.blue];

      // Initialize any uninitialized channels in parallel
      const uninitialized = keys.filter((k) => !layerState.channels[k]?.isInitialized);

      if (uninitialized.length > 0) {
        set(
          (state) => {
            for (const k of uninitialized) {
              state.layersStates[activeChannelsStateIndex].channels[k].isLoading = true;
            }
          },
          false,
          "setBrightfieldVisibility/stats/request",
        );

        try {
          const results = await Promise.all(
            uninitialized.map((k) =>
              getSelectionStats({
                loader: state.loader!,
                selection: layerState.channels[k].selection,
              }).then((stats) => ({ key: k, ...stats })),
            ),
          );

          return set(
            (state) => {
              const ls = state.layersStates[activeChannelsStateIndex];
              for (const { key: k, domain, histogram } of results) {
                const channel = ls.channels[k];
                channel.isInitialized = true;
                channel.isLoading = false;
                channel.domain = castDraft(domain);
                // Brightfield: use full domain range (no percentile scaling)
                channel.contrastLimits = [...domain] as ByteDomain;
                channel.contrastLimitsInitial = castDraft(domain);
                channel.histogram = castDraft(histogram);
              }
              for (const k of keys) {
                ls.channels[k].isVisible = isVisible;
              }
            },
            false,
            "setBrightfieldVisibility/stats/success",
          );
        } catch {
          return set(
            (state) => {
              const ls = state.layersStates[activeChannelsStateIndex];
              for (const k of uninitialized) {
                ls.channels[k].isLoading = false;
                ls.channels[k].isVisible = false;
              }
            },
            false,
            "setBrightfieldVisibility/stats/error",
          );
        }
      }

      return set(
        (state) => {
          const ls = state.layersStates[activeChannelsStateIndex];
          for (const k of keys) {
            ls.channels[k].isVisible = isVisible;
          }
        },
        false,
        "setBrightfieldVisibility",
      );
    }

    // Single channel
    const activeChannelsStateConfig = layerState.channels[key];

    if (!activeChannelsStateConfig.isInitialized) {
      set(
        (state) => {
          state.layersStates[activeChannelsStateIndex].channels[key].isLoading = true;
        },
        false,
        "setChannelVisibility/stats/request",
      );

      try {
        const { domain, contrastLimits, histogram } = await getSelectionStats({
          loader: state.loader,
          selection: activeChannelsStateConfig.selection,
        });

        return set(
          (state) => {
            const channel = state.layersStates[activeChannelsStateIndex].channels[key];
            channel.isInitialized = true;
            channel.isLoading = false;
            channel.domain = castDraft(domain);
            channel.contrastLimits = contrastLimits;
            channel.contrastLimitsInitial = castDraft(contrastLimits);
            channel.histogram = castDraft(histogram);
            channel.isVisible = isVisible;
          },
          false,
          "setChannelVisibility/stats/success",
        );
      } catch {
        return set(
          (state) => {
            const channel = state.layersStates[activeChannelsStateIndex].channels[key];
            channel.isLoading = false;
            channel.isVisible = false;
          },
          false,
          "setChannelVisibility/stats/error",
        );
      }
    }

    set(
      (state) => {
        state.layersStates[activeChannelsStateIndex].channels[key].isVisible = isVisible;
      },
      false,
      "setChannelVisibility",
    );
  },

  setChannelColor: (key, color) =>
    set(
      (state) => {
        const activeChannelsStateIndex = state.imagePanels[state.imagePanelIndex];
        const channel = state.layersStates[activeChannelsStateIndex]?.channels[key];

        if (channel) {
          channel.color = color.slice(0, 3) as RGB;
        }
      },
      false,
      "setChannelColor",
    ),

  setChannelsOpacity: (channelsOpacity) =>
    set(
      (state) => {
        const activeImagePanelIndex = state.imagePanels[state.imagePanelIndex];
        const layerState = state.layersStates[activeImagePanelIndex];

        if (layerState) {
          layerState.channelsOpacity = channelsOpacity;
        }
      },
      false,
      "setChannelsOpacity",
    ),
});
