import { castDraft } from "immer";

import { getSelectionStats } from "../../../utils/getSelectionStats";
import { getInitialChannelsState } from "../getInitialChannelsState";
import {
  BRIGHTFIELD_GROUP_ID,
  ByteDomain,
  ChannelsState,
  ChannelsStateColumns,
  createDefaultLayersStateEntry,
  detectBrightfieldGroup,
  LayersStateEntry,
  RGB,
  RGBA,
  ViewerSlice,
} from "../types";
import { sidecarEntryToLayersState, type ViewSettingsEntry } from "~/utils/db/viewSettingsSchema";

export interface ChannelsSlice {
  selectedChannelId: keyof ChannelsState | null;
  imagePanelIndex: number;
  imagePanels: number[];

  channels: ChannelsState;
  channelIds: string[];

  layersStates: LayersStateEntry[];

  setIsChannelsLoading: (imagePanelId: number, count: number) => void;
  setSelectedChannelId: (selectedChannelId: keyof ChannelsState | null) => void;
  setActiveImagePanelId: (imagePanelIndex: number) => void;
  addImagePanel: () => void;
  addChannelsState: () => void;
  removeChannelsState: (channelsStateIndex: number) => void;
  setActivePresetIndex: (channelsStateIndex: number) => void;
  removeImagePanel: (index: number) => void;
  setContrastLimits: (contrastLimits: ByteDomain) => void;
  resetContrastLimits: () => void;
  setChannelVisibility: (key: keyof ChannelsStateColumns, isVisible: boolean) => void;
  setChannelColor: (key: keyof ChannelsState, color: RGBA) => void;
  setChannelsOpacity: (opacity: number) => void;
  setViewName: (index: number, name: string | null) => void;
  shareView: (index: number) => void;
  unshareView: (index: number) => void;
  forkView: (index: number) => void;
  loadSharedViews: (entries: ViewSettingsEntry[]) => void;
}

/**
 * Channels + image-panel layer state: the per-panel `layersStates` array, the
 * active panel/channel selection, channel init (stats/histogram), contrast,
 * colors, and visibility (incl. brightfield R/G/B grouping).
 */
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
    imagePanelIndex: -1,
    imagePanels: [],
    channels: {},
    channelIds: [],
    layersStates: [],

    setIsChannelsLoading: (imagePanelId, count) =>
      set(
        (viewerStore) => {
          const layersStateIndex = viewerStore.imagePanels[imagePanelId];
          const layerState = viewerStore.layersStates[layersStateIndex];
          if (layerState) {
            layerState.isChannelsLoading = count;
          }
        },
        false,
        "setIsChannelsLoading",
      ),

    setSelectedChannelId: (selectedChannelId) =>
      set(
        (viewerStore) => {
          viewerStore.selectedChannelId = selectedChannelId;
        },
        false,
        "setSelectedChannelId",
      ),

    setActiveImagePanelId: (imagePanelIndex) =>
      set(
        (viewerStore) => {
          viewerStore.imagePanelIndex = imagePanelIndex;
        },
        false,
        "setActiveImagePanelId",
      ),

    addImagePanel: () =>
      set(
        (viewerStore) => {
          const referencedIndices = new Set(viewerStore.imagePanels);
          const availableIndex = viewerStore.layersStates.findIndex(
            (layerState, index) =>
              !referencedIndices.has(index) &&
              layerState.author === viewerStore.currentUserId &&
              !layerState.shared,
          );
          if (availableIndex >= 0) {
            viewerStore.imagePanels.push(availableIndex);
          } else {
            viewerStore.layersStates.push(createDefaultLayersStateEntry(viewerStore.currentUserId));
            viewerStore.imagePanels.push(viewerStore.layersStates.length - 1);
          }
        },
        false,
        "addImagePanel",
      ),

    addChannelsState: () => {
      const state = get();
      if (!state.metadata || !state.loader) return;

      if (state.imagePanelIndex < 0) {
        const { channelsState, channelIds, firstChannelKey } = getInitialChannelsState(
          state.metadata,
          state.loader,
        );

        const sharedIdx = state.layersStates.findIndex(
          (layerState) => layerState.shared && layerState.author !== state.currentUserId,
        );
        const defaultEntry = createDefaultLayersStateEntry(state.currentUserId);

        set(
          (viewerStore) => {
            let activeImagePanelIndex: number;
            if (sharedIdx >= 0) {
              activeImagePanelIndex = sharedIdx;
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
        if (layerState?.shared && layerState.author !== state.currentUserId) {
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

    removeChannelsState: (i) =>
      set(
        (viewerStore) => {
          if (viewerStore.layersStates.length <= 1) return;
          if (viewerStore.layersStates[i]?.author !== viewerStore.currentUserId) return;
          viewerStore.imagePanels = viewerStore.imagePanels.map((imagePanelIndex) => {
            if (imagePanelIndex === i) return 0;
            if (imagePanelIndex > i) return imagePanelIndex - 1;
            return imagePanelIndex;
          });
          viewerStore.layersStates = viewerStore.layersStates.filter((_, index) => index !== i);
        },
        false,
        "removeChannelsState",
      ),

    setActivePresetIndex: (channelsStateIndex) => {
      const state = get();
      const targetChannels = state.layersStates[channelsStateIndex]?.channels ?? {};
      const bfGroup = detectBrightfieldGroup(state.channelIds);
      const bfSet = bfGroup ? new Set([bfGroup.red, bfGroup.green, bfGroup.blue]) : null;

      const current = state.selectedChannelId as string | null;
      let keepCurrent = false;
      if (current === BRIGHTFIELD_GROUP_ID && bfGroup) {
        keepCurrent =
          !!targetChannels[bfGroup.red]?.isVisible &&
          !!targetChannels[bfGroup.green]?.isVisible &&
          !!targetChannels[bfGroup.blue]?.isVisible;
      } else if (current && current !== BRIGHTFIELD_GROUP_ID) {
        keepCurrent = !!targetChannels[current]?.isVisible;
      }

      let newSelected: string | null = null;
      if (keepCurrent) {
        newSelected = current;
      } else {
        for (const id of state.channelIds) {
          if (bfSet?.has(id)) continue;
          if (targetChannels[id]?.isVisible) {
            newSelected = id;
            break;
          }
        }
        if (!newSelected && bfGroup) {
          if (
            targetChannels[bfGroup.red]?.isVisible &&
            targetChannels[bfGroup.green]?.isVisible &&
            targetChannels[bfGroup.blue]?.isVisible
          ) {
            newSelected = BRIGHTFIELD_GROUP_ID;
          }
        }
      }

      set(
        (draft) => {
          draft.imagePanels = draft.imagePanels.map((panel, index) =>
            index === draft.imagePanelIndex ? channelsStateIndex : panel,
          );
          draft.selectedChannelId = newSelected as keyof ChannelsState | null;
        },
        false,
        "setActivePresetIndex",
      );

      const visibleUninit = state.channelIds.filter(
        (id) =>
          !bfSet?.has(id) && !!targetChannels[id]?.isVisible && !state.channels[id]?.isInitialized,
      );
      if (bfGroup) {
        const trioVisible =
          targetChannels[bfGroup.red]?.isVisible &&
          targetChannels[bfGroup.green]?.isVisible &&
          targetChannels[bfGroup.blue]?.isVisible;
        if (trioVisible) {
          for (const k of [bfGroup.red, bfGroup.green, bfGroup.blue]) {
            if (!state.channels[k]?.isInitialized && !visibleUninit.includes(k)) {
              visibleUninit.push(k);
            }
          }
        }
      }
      if (visibleUninit.length > 0) {
        void Promise.all(visibleUninit.map((key) => initChannelStats(key)));
      }
    },

    setViewName: (index, name) =>
      set(
        (viewerStore) => {
          if (index < 0 || index >= viewerStore.layersStates.length) return;
          if (viewerStore.layersStates[index]?.author !== viewerStore.currentUserId) return;
          const trimmed = name?.trim();
          viewerStore.layersStates[index].name = trimmed ? trimmed : undefined;
        },
        false,
        "setViewName",
      ),

    removeImagePanel: (imagePanelIndex) =>
      set(
        (viewerStore) => {
          viewerStore.imagePanelIndex = imagePanelIndex - 1;
          viewerStore.imagePanels = viewerStore.imagePanels.filter(
            (_, index) => index !== imagePanelIndex,
          );
        },
        false,
        "removeImagePanel",
      ),

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

    /**
     * Sets the visibility of a channel in the active image panel.
     * If the channel is not initialized, it loads stats and initializes it before setting visibility.
     * Handles BRIGHTFIELD_GROUP_ID by toggling all R/G/B channels together.
     */
    setChannelVisibility: async (key: keyof ChannelsState, isVisible: boolean) => {
      const state = get();

      if (!state.loader || state.imagePanelIndex < 0) return;

      // Brightfield group: toggle all 3 channels
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

      // Single channel
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

    shareView: (index) =>
      set(
        (viewerStore) => {
          if (index < 0 || index >= viewerStore.layersStates.length) return;
          const entry = viewerStore.layersStates[index];
          if (entry.author !== viewerStore.currentUserId) return;
          if (!entry.author) entry.author = viewerStore.currentUserId;
          entry.shared = true;
        },
        false,
        "shareView",
      ),

    unshareView: (index) =>
      set(
        (viewerStore) => {
          if (index < 0 || index >= viewerStore.layersStates.length) return;
          const entry = viewerStore.layersStates[index];
          if (entry.author !== viewerStore.currentUserId) return;
          entry.shared = false;
        },
        false,
        "unshareView",
      ),

    forkView: (index) =>
      set(
        (viewerStore) => {
          if (index < 0 || index >= viewerStore.layersStates.length) return;
          const source = viewerStore.layersStates[index];
          if (!source) return;
          const clone: LayersStateEntry = {
            ...source,
            id: crypto.randomUUID(),
            author: viewerStore.currentUserId,
            shared: false,
            name: source.name ? `${source.name} (copy)` : undefined,
          };
          viewerStore.layersStates.push(clone);
          viewerStore.imagePanels[viewerStore.imagePanelIndex] =
            viewerStore.layersStates.length - 1;
        },
        false,
        "forkView",
      ),

    loadSharedViews: (entries) =>
      set(
        (viewerStore) => {
          if (entries.length === 0) return;
          const existingIds = new Set(viewerStore.layersStates.map((ls) => ls.id));
          for (const entry of entries) {
            if (existingIds.has(entry.id)) {
              const idx = viewerStore.layersStates.findIndex((ls) => ls.id === entry.id);
              if (idx >= 0) {
                viewerStore.layersStates[idx] = sidecarEntryToLayersState(entry);
              }
            } else {
              viewerStore.layersStates.push(sidecarEntryToLayersState(entry));
            }
          }
        },
        false,
        "loadSharedViews",
      ),
  };
};
