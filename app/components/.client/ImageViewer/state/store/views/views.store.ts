import type { LayersStateEntry, ViewerSlice } from "../types";
import {
  BRIGHTFIELD_GROUP_ID,
  ChannelsStateColumns,
  createDefaultLayersStateEntry,
  detectBrightfieldGroup,
  ChannelsState,
} from "../types";
import { sidecarEntryToLayersState, type ViewSettingsEntry } from "~/utils/db/viewSettingsSchema";

export interface ViewsSlice {
  imagePanelIndex: number;
  imagePanels: number[];
  layersStates: LayersStateEntry[];

  setIsChannelsLoading: (imagePanelId: number, count: number) => void;
  setActiveImagePanelId: (imagePanelIndex: number) => void;
  addImagePanel: () => void;
  removeChannelsState: (channelsStateIndex: number) => void;
  setActivePresetIndex: (channelsStateIndex: number) => void;
  removeImagePanel: (index: number) => void;
  setViewName: (index: number, name: string | null) => void;
  shareView: (index: number) => void;
  unshareView: (index: number) => void;
  forkView: (index: number) => void;
  loadSharedViews: (entries: ViewSettingsEntry[]) => void;
}

export const createViewsSlice: ViewerSlice<ViewsSlice> = (set, get) => ({
  imagePanelIndex: -1,
  imagePanels: [],
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

  setActiveImagePanelId: (imagePanelIndex) =>
    set(
      (viewerStore) => {
        viewerStore.imagePanelIndex = imagePanelIndex;
      },
      false,
      "setActiveImagePanelId",
    ),

  addImagePanel: () => {
    set(
      (viewerStore) => {
        const referencedIndices = new Set(viewerStore.imagePanels);
        const availableIndex = viewerStore.layersStates.findIndex(
          (_, index) => !referencedIndices.has(index),
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
    );

    const newPanelSlot = get().imagePanels.length - 1;
    const newPresetIndex = get().imagePanels[newPanelSlot];
    const hasChannels = Object.keys(get().layersStates[newPresetIndex]?.channels ?? {}).length > 0;
    if (hasChannels) return;

    const savedPanelIndex = get().imagePanelIndex;
    get().setActiveImagePanelId(newPanelSlot);

    const firstChannelKey = get().channelIds[0] as keyof ChannelsStateColumns | undefined;
    if (firstChannelKey) {
      void get().setChannelVisibility(firstChannelKey, true);
    }

    get().setActiveImagePanelId(savedPanelIndex);
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
      void Promise.all(visibleUninit.map((key) => get().initChannelStats(key)));
    }
  },

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
        viewerStore.imagePanels[viewerStore.imagePanelIndex] = viewerStore.layersStates.length - 1;
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
});
