import { castDraft } from "immer";

import { getInitialChannelsState } from "./getInitialChannelsState";
import { getSelectionStats } from "../../../utils/getSelectionStats";
import {
  BRIGHTFIELD_GROUP_ID,
  ByteDomain,
  ChannelsState,
  ChannelsStateColumns,
  createDefaultLayersStateEntry,
  detectBrightfieldGroup,
  RGB,
  RGBA,
  ViewerSlice,
} from "../types";

export interface ChannelsSlice {
  selectedChannelId: keyof ChannelsState | null;
  channels: ChannelsState;
  channelIds: string[];

  setSelectedChannelId: (selectedChannelId: keyof ChannelsState | null) => void;
  initChannelStats: (key: string) => Promise<boolean>;
  addChannelsState: () => void;
  setContrastLimits: (contrastLimits: ByteDomain) => void;
  resetContrastLimits: () => void;
  setChannelVisibility: (key: keyof ChannelsStateColumns, isVisible: boolean) => void;
  setChannelColor: (key: keyof ChannelsState, color: RGBA) => void;
  setChannelsOpacity: (opacity: number) => void;
}

/** Channel state: channel data, contrast, visibility, color, opacity, stats. */
export const createChannelsSlice: ViewerSlice<ChannelsSlice> = (set, get) => {
  const initChannelStats = async (key: string): Promise<boolean> => {
    const state = get();
    if (!state.loader) return false;
    const channel = state.channels[key];
    if (!channel || channel.isInitialized) return false;

    set(
      (viewerStore) => {
        viewerStore.channels[key].isLoading = true;
      },
      false,
      "initChannelStats/request",
    );

    try {
      const { domain, contrastLimits, histogram } = await getSelectionStats({
        loader: state.loader,
        selection: channel.selection,
      });

      set(
        (viewerStore) => {
          const c = viewerStore.channels[key];
          c.isInitialized = true;
          c.isLoading = false;
          c.domain = castDraft(domain);
          c.histogram = castDraft(histogram);
          c.contrastLimits = castDraft(contrastLimits);
        },
        false,
        "initChannelStats/success",
      );
      return true;
    } catch {
      set(
        (viewerStore) => {
          viewerStore.channels[key].isLoading = false;
        },
        false,
        "initChannelStats/error",
      );
      return false;
    }
  };

  return {
    selectedChannelId: null,
    channels: {},
    channelIds: [],

    setSelectedChannelId: (selectedChannelId) =>
      set(
        (viewerStore) => {
          viewerStore.selectedChannelId = selectedChannelId;
        },
        false,
        "setSelectedChannelId",
      ),

    initChannelStats,

    addChannelsState: () => {
      const state = get();
      if (!state.metadata || !state.loader) return;

      if (state.imagePanelIndex < 0) {
        const { channelsState, channelIds, firstChannelKey } = getInitialChannelsState(
          state.metadata,
          state.loader,
        );

        // Adoption order: the user's own shared view, else a peer's shared
        // view (adopted read-only — the first write auto-forks it into the
        // user's own views via withAutoFork), else a fresh default.
        const sharedIdx = state.layersStates.findIndex(
          (layerState) => layerState.shared && layerState.author === state.currentUserId,
        );
        const peerSharedIdx =
          sharedIdx >= 0 ? -1 : state.layersStates.findIndex((layerState) => layerState.shared);
        const defaultEntry = createDefaultLayersStateEntry(state.currentUserId);

        set(
          (viewerStore) => {
            let activeImagePanelIndex: number;
            if (sharedIdx >= 0) {
              activeImagePanelIndex = sharedIdx;
            } else if (peerSharedIdx >= 0) {
              activeImagePanelIndex = peerSharedIdx;
            } else {
              viewerStore.layersStates.push(defaultEntry);
              activeImagePanelIndex = viewerStore.layersStates.length - 1;
            }
            viewerStore.imagePanelIndex = 0;
            viewerStore.imagePanels = [activeImagePanelIndex];
            viewerStore.selectedChannelId = firstChannelKey;
            viewerStore.channels = castDraft(channelsState);
            viewerStore.channelIds = channelIds;
          },
          false,
          "addChannelsStateInitial",
        );

        const activeImagePanelIndex = get().imagePanels[0]!;
        const layerState = get().layersStates[activeImagePanelIndex];
        if (layerState?.shared) {
          get().setActivePresetIndex(activeImagePanelIndex);
        } else {
          const bfGroup = detectBrightfieldGroup(channelIds);
          const initKey = bfGroup ? BRIGHTFIELD_GROUP_ID : firstChannelKey;
          state.setChannelVisibility(initKey as keyof ChannelsStateColumns, true);
        }
        return;
      }

      const newPresetIndex = get().layersStates.length;

      set(
        (draft) => {
          draft.imagePanels = draft.imagePanels.map((imagePanelIndex, index) => {
            if (index === draft.imagePanelIndex) {
              return newPresetIndex;
            }
            return imagePanelIndex;
          });
          draft.layersStates.push(createDefaultLayersStateEntry(draft.currentUserId));
        },
        false,
        "addChannelsStateNew",
      );

      const firstChannelKey = get().channelIds[0] as keyof ChannelsStateColumns;
      if (firstChannelKey) {
        get().setChannelVisibility(firstChannelKey, true);
      }
    },

    setContrastLimits: (contrastLimits) =>
      set(
        (viewerStore) => {
          const activePresetIndex = viewerStore.imagePanels[viewerStore.imagePanelIndex];
          const layerState = viewerStore.layersStates[activePresetIndex];
          if (!layerState) return;

          if (viewerStore.selectedChannelId === BRIGHTFIELD_GROUP_ID) {
            const group = detectBrightfieldGroup(viewerStore.channelIds);
            if (!group) return;
            for (const key of [group.red, group.green, group.blue]) {
              if (!viewerStore.channels[key]) continue;
              (layerState.channels[key] ??= {}).contrastLimits = contrastLimits;
            }
          } else {
            const key = viewerStore.selectedChannelId as keyof ChannelsStateColumns;
            if (!viewerStore.channels[key]) return;
            (layerState.channels[key] ??= {}).contrastLimits = contrastLimits;
          }
        },
        false,
        "setContrastLimits",
      ),

    resetContrastLimits: () =>
      set(
        (viewerStore) => {
          const activePresetIndex = viewerStore.imagePanels[viewerStore.imagePanelIndex];
          const layerState = viewerStore.layersStates[activePresetIndex];
          if (!layerState) return;

          if (viewerStore.selectedChannelId === BRIGHTFIELD_GROUP_ID) {
            const group = detectBrightfieldGroup(viewerStore.channelIds);
            if (!group) return;
            for (const key of [group.red, group.green, group.blue]) {
              const defaultChannel = viewerStore.channels[key];
              if (!defaultChannel) continue;
              (layerState.channels[key] ??= {}).contrastLimits = [
                ...defaultChannel.contrastLimits,
              ] as ByteDomain;
            }
          } else {
            const key = viewerStore.selectedChannelId as keyof ChannelsStateColumns;
            const defaultChannel = viewerStore.channels[key];
            if (!defaultChannel) return;
            (layerState.channels[key] ??= {}).contrastLimits = [
              ...defaultChannel.contrastLimits,
            ] as ByteDomain;
          }
        },
        false,
        "resetContrastLimits",
      ),

    setChannelVisibility: async (key: keyof ChannelsState, isVisible: boolean) => {
      const state = get();

      if (!state.loader || state.imagePanelIndex < 0) return;

      if (key === BRIGHTFIELD_GROUP_ID) {
        const group = detectBrightfieldGroup(state.channelIds);
        if (!group) return;
        const keys = [group.red, group.green, group.blue];

        const uninitialized = keys.filter((k) => !state.channels[k]?.isInitialized);

        if (uninitialized.length > 0) {
          set(
            (viewerStore) => {
              for (const k of uninitialized) {
                viewerStore.channels[k].isLoading = true;
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
                  selection: state.channels[k].selection,
                }).then((stats) => ({ key: k, ...stats })),
              ),
            );

            return set(
              (viewerStore) => {
                const idx = viewerStore.imagePanels[viewerStore.imagePanelIndex];
                const ls = viewerStore.layersStates[idx];
                for (const { key: k, domain, histogram } of results) {
                  const channel = viewerStore.channels[k];
                  channel.isInitialized = true;
                  channel.isLoading = false;
                  channel.domain = castDraft(domain);
                  channel.histogram = castDraft(histogram);

                  (ls.channels[k] ??= {}).contrastLimits = [...domain] as ByteDomain;
                  channel.contrastLimits = [...domain] as ByteDomain;
                }
                for (const k of keys) {
                  (ls.channels[k] ??= {}).isVisible = isVisible;
                }
              },
              false,
              "setBrightfieldVisibility/stats/success",
            );
          } catch {
            return set(
              (viewerStore) => {
                const idx = viewerStore.imagePanels[viewerStore.imagePanelIndex];
                const ls = viewerStore.layersStates[idx];
                for (const k of uninitialized) {
                  viewerStore.channels[k].isLoading = false;
                  (ls.channels[k] ??= {}).isVisible = false;
                }
              },
              false,
              "setBrightfieldVisibility/stats/error",
            );
          }
        }

        return set(
          (viewerStore) => {
            const idx = viewerStore.imagePanels[viewerStore.imagePanelIndex];
            const ls = viewerStore.layersStates[idx];
            for (const k of keys) {
              (ls.channels[k] ??= {}).isVisible = isVisible;
            }
          },
          false,
          "setBrightfieldVisibility",
        );
      }

      const topLevelChannel = state.channels[key];
      if (!topLevelChannel) return;

      if (!topLevelChannel.isInitialized) {
        const ok = await initChannelStats(key as string);
        if (!ok) {
          return set(
            (viewerStore) => {
              const idx = viewerStore.imagePanels[viewerStore.imagePanelIndex];
              (viewerStore.layersStates[idx].channels[key] ??= {}).isVisible = false;
            },
            false,
            "setChannelVisibility/stats/error",
          );
        }

        const loaded = get().channels[key];
        return set(
          (viewerStore) => {
            const idx = viewerStore.imagePanels[viewerStore.imagePanelIndex];
            const lc = (viewerStore.layersStates[idx].channels[key] ??= {});
            lc.contrastLimits = loaded.contrastLimits as ByteDomain;
            lc.isVisible = isVisible;
          },
          false,
          "setChannelVisibility/stats/success",
        );
      }

      set(
        (viewerStore) => {
          const idx = viewerStore.imagePanels[viewerStore.imagePanelIndex];
          (viewerStore.layersStates[idx].channels[key] ??= {}).isVisible = isVisible;
        },
        false,
        "setChannelVisibility",
      );
    },

    setChannelColor: (key, color) =>
      set(
        (viewerStore) => {
          const activePresetIndex = viewerStore.imagePanels[viewerStore.imagePanelIndex];
          const layerState = viewerStore.layersStates[activePresetIndex];
          if (!layerState) return;

          if (!viewerStore.channels[key]) return;
          (layerState.channels[key] ??= {}).color = color.slice(0, 3) as RGB;
        },
        false,
        "setChannelColor",
      ),

    setChannelsOpacity: (channelsOpacity) =>
      set(
        (viewerStore) => {
          const activeImagePanelIndex = viewerStore.imagePanels[viewerStore.imagePanelIndex];
          const layerState = viewerStore.layersStates[activeImagePanelIndex];

          if (layerState) {
            layerState.channelsOpacity = channelsOpacity;
          }
        },
        false,
        "setChannelsOpacity",
      ),
  };
};
