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
      (s) => {
        s.channels[key].isLoading = true;
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
        (s) => {
          const c = s.channels[key];
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
        (s) => {
          s.channels[key].isLoading = false;
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
          const activePresetIndex = state.imagePanels[state.imagePanelIndex];
          const source =
            activePresetIndex !== undefined ? state.layersStates[activePresetIndex] : undefined;
          const newPresetIndex = state.layersStates.length;
          state.layersStates.push(
            source ? { ...source } : createDefaultLayersStateEntry(state.currentUserId),
          );
          state.imagePanels.push(newPresetIndex);
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
          (ls) => ls.shared && ls.author !== state.currentUserId,
        );
        const defaultEntry = createDefaultLayersStateEntry(state.currentUserId);

        set(
          (state) => {
            let activeIdx: number;
            if (sharedIdx >= 0) {
              activeIdx = sharedIdx;
            } else {
              state.layersStates.push(defaultEntry);
              activeIdx = state.layersStates.length - 1;
            }
            state.imagePanelIndex = 0;
            state.imagePanels = [activeIdx];
            state.selectedChannelId = firstChannelKey;
            state.channels = castDraft(channelsState);
            state.channelIds = channelIds;
          },
          false,
          "addChannelsStateInitial",
        );

        // For brightfield images (Red/Green/Blue channel set), toggle the group
        // as a unit so all three channels get the brightfield-specific init
        // (full domain range, no percentile scaling). For regular images, toggle
        // the first channel as before.
        const bfGroup = detectBrightfieldGroup(channelIds);
        const initKey = bfGroup ? BRIGHTFIELD_GROUP_ID : firstChannelKey;
        state.setChannelVisibility(initKey as keyof ChannelsStateColumns, true);

        const activeIdx = get().imagePanels[0]!;
        const ls = get().layersStates[activeIdx];
        if (ls?.shared && ls.author !== state.currentUserId) {
          get().setActivePresetIndex(activeIdx);
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
        (state) => {
          if (state.layersStates.length <= 1) return;
          if (state.layersStates[i]?.author !== state.currentUserId) return;
          state.imagePanels = state.imagePanels.map((imagePanelIndex) => {
            if (imagePanelIndex === i) return 0;
            if (imagePanelIndex > i) return imagePanelIndex - 1;
            return imagePanelIndex;
          });
          state.layersStates = state.layersStates.filter((_, index) => index !== i);
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
        (state) => {
          if (index < 0 || index >= state.layersStates.length) return;
          if (state.layersStates[index]?.author !== state.currentUserId) return;
          const trimmed = name?.trim();
          state.layersStates[index].name = trimmed ? trimmed : undefined;
        },
        false,
        "setViewName",
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
          const activePresetIndex = state.imagePanels[state.imagePanelIndex];
          const layerState = state.layersStates[activePresetIndex];
          if (!layerState) return;

          if (state.selectedChannelId === BRIGHTFIELD_GROUP_ID) {
            const group = detectBrightfieldGroup(state.channelIds);
            if (!group) return;
            for (const key of [group.red, group.green, group.blue]) {
              if (!state.channels[key]) continue;
              (layerState.channels[key] ??= {}).contrastLimits = contrastLimits;
            }
          } else {
            const key = state.selectedChannelId as keyof ChannelsStateColumns;
            if (!state.channels[key]) return;
            (layerState.channels[key] ??= {}).contrastLimits = contrastLimits;
          }
        },
        false,
        "setContrastLimits",
      ),

    resetContrastLimits: () =>
      set(
        (state) => {
          const activePresetIndex = state.imagePanels[state.imagePanelIndex];
          const layerState = state.layersStates[activePresetIndex];
          if (!layerState) return;

          if (state.selectedChannelId === BRIGHTFIELD_GROUP_ID) {
            const group = detectBrightfieldGroup(state.channelIds);
            if (!group) return;
            for (const key of [group.red, group.green, group.blue]) {
              const defaultChannel = state.channels[key];
              if (!defaultChannel) continue;
              (layerState.channels[key] ??= {}).contrastLimits = [
                ...defaultChannel.contrastLimits,
              ] as ByteDomain;
            }
          } else {
            const key = state.selectedChannelId as keyof ChannelsStateColumns;
            const defaultChannel = state.channels[key];
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

      const activePresetIndex = state.imagePanels[state.imagePanelIndex];

      // Brightfield group: toggle all 3 channels
      if (key === BRIGHTFIELD_GROUP_ID) {
        const group = detectBrightfieldGroup(state.channelIds);
        if (!group) return;
        const keys = [group.red, group.green, group.blue];

        const uninitialized = keys.filter((k) => !state.channels[k]?.isInitialized);

        if (uninitialized.length > 0) {
          set(
            (state) => {
              for (const k of uninitialized) {
                state.channels[k].isLoading = true;
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
              (state) => {
                const ls = state.layersStates[activePresetIndex];
                for (const { key: k, domain, histogram } of results) {
                  const channel = state.channels[k];
                  channel.isInitialized = true;
                  channel.isLoading = false;
                  channel.domain = castDraft(domain);
                  channel.histogram = castDraft(histogram);

                  // Brightfield: use full domain range (no percentile scaling)
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
              (state) => {
                const ls = state.layersStates[activePresetIndex];
                for (const k of uninitialized) {
                  state.channels[k].isLoading = false;
                  (ls.channels[k] ??= {}).isVisible = false;
                }
              },
              false,
              "setBrightfieldVisibility/stats/error",
            );
          }
        }

        return set(
          (state) => {
            const ls = state.layersStates[activePresetIndex];
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
            (s) => {
              (s.layersStates[activePresetIndex].channels[key] ??= {}).isVisible = false;
            },
            false,
            "setChannelVisibility/stats/error",
          );
        }

        const loaded = get().channels[key];
        return set(
          (s) => {
            const lc = (s.layersStates[activePresetIndex].channels[key] ??= {});
            lc.contrastLimits = loaded.contrastLimits as ByteDomain;
            lc.isVisible = isVisible;
          },
          false,
          "setChannelVisibility/stats/success",
        );
      }

      set(
        (s) => {
          (s.layersStates[activePresetIndex].channels[key] ??= {}).isVisible = isVisible;
        },
        false,
        "setChannelVisibility",
      );
    },

    setChannelColor: (key, color) =>
      set(
        (state) => {
          const activePresetIndex = state.imagePanels[state.imagePanelIndex];
          const layerState = state.layersStates[activePresetIndex];
          if (!layerState) return;

          if (!state.channels[key]) return;
          (layerState.channels[key] ??= {}).color = color.slice(0, 3) as RGB;
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

    shareView: (index) =>
      set(
        (state) => {
          if (index < 0 || index >= state.layersStates.length) return;
          const entry = state.layersStates[index];
          if (entry.author !== state.currentUserId) return;
          if (!entry.author) entry.author = state.currentUserId;
          entry.shared = true;
        },
        false,
        "shareView",
      ),

    unshareView: (index) =>
      set(
        (state) => {
          if (index < 0 || index >= state.layersStates.length) return;
          const entry = state.layersStates[index];
          if (entry.author !== state.currentUserId) return;
          entry.shared = false;
        },
        false,
        "unshareView",
      ),

    forkView: (index) =>
      set(
        (state) => {
          if (index < 0 || index >= state.layersStates.length) return;
          const source = state.layersStates[index];
          if (!source) return;
          const clone: LayersStateEntry = {
            ...source,
            id: crypto.randomUUID(),
            author: state.currentUserId,
            shared: false,
            name: source.name ? `${source.name} (copy)` : undefined,
          };
          state.layersStates.push(clone);
        },
        false,
        "forkView",
      ),

    loadSharedViews: (entries) =>
      set(
        (state) => {
          if (entries.length === 0) return;
          const existingIds = new Set(state.layersStates.map((ls) => ls.id));
          for (const entry of entries) {
            if (existingIds.has(entry.id)) {
              const idx = state.layersStates.findIndex((ls) => ls.id === entry.id);
              if (idx >= 0) {
                state.layersStates[idx] = sidecarEntryToLayersState(entry);
              }
            } else {
              state.layersStates.push(sidecarEntryToLayersState(entry));
            }
          }
        },
        false,
        "loadSharedViews",
      ),
  };
};
