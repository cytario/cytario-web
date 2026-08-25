import { describe, expect, it } from "vitest";

import type { ViewerStore } from "../types";
import { viewerStoreMigrate, viewerStorePartialize } from "../viewerStore.persistence";

function makeLayersState(author: string, overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    author,
    channels: {},
    overlays: {},
    channelsOpacity: 1,
    overlaysFillOpacity: 0.8,
    showCellOutline: true,
    annotationsOpacity: 1,
    showAnnotationOutline: true,
    isChannelsLoading: 0,
    isOverlaysLoading: 0,
    ...overrides,
  };
}

function makeStoreState(overrides: Partial<ViewerStore> = {}): ViewerStore {
  return {
    currentUserId: "user-a",
    selectedChannelId: null,
    imagePanelIndex: 0,
    imagePanels: [0],
    layersStates: [],
    channels: {},
    channelIds: [],
    viewStateActive: null,
    annotationClasses: [],
    annotationActiveClass: null,
    ...overrides,
  } as unknown as ViewerStore;
}

describe("viewerStorePartialize", () => {
  it("includes only own views in persisted layersStates", () => {
    const state = makeStoreState({
      currentUserId: "user-a",
      layersStates: [
        makeLayersState("user-a", { name: "My View" }),
        makeLayersState("user-b", { name: "Peer View", shared: true }),
        makeLayersState("user-a", { name: "My Shared View", shared: true }),
      ],
    });

    const result = viewerStorePartialize(state);
    expect(result.layersStates).toHaveLength(2);
    expect(result.layersStates.every((ls) => ls.author === "user-a")).toBe(true);
  });

  it("excludes all peer-authored views even when shared", () => {
    const state = makeStoreState({
      currentUserId: "user-a",
      layersStates: [
        makeLayersState("user-b", { shared: true }),
        makeLayersState("user-c", { shared: true }),
      ],
    });

    const result = viewerStorePartialize(state);
    expect(result.layersStates).toHaveLength(0);
  });

  it("persists currentUserId for cross-session identity", () => {
    const state = makeStoreState({ currentUserId: "user-x" });
    expect(viewerStorePartialize(state).currentUserId).toBe("user-x");
  });

  it("returns empty layersStates when none authored by current user", () => {
    const state = makeStoreState({
      currentUserId: "user-a",
      layersStates: [makeLayersState("user-b")],
    });

    expect(viewerStorePartialize(state).layersStates).toEqual([]);
  });

  it("preserves non-layersStates fields (channels, channelIds, etc.)", () => {
    const channels = {
      "ch-1": {
        isVisible: true,
        contrastLimits: [0, 255],
        color: [255, 0, 0],
      },
    } as unknown as ViewerStore["channels"];
    const state = makeStoreState({
      channels,
      channelIds: ["ch-1"],
      imagePanelIndex: 2,
      imagePanels: [0, 1, 2],
    });

    const result = viewerStorePartialize(state);
    expect(result.channels).toBe(channels);
    expect(result.channelIds).toEqual(["ch-1"]);
    expect(result.imagePanelIndex).toBe(2);
    expect(result.imagePanels).toEqual([0, 1, 2]);
  });
});

describe("viewerStoreMigrate", () => {
  it("resets to fallback for any pre-v5 state (migration 4 is destructive)", () => {
    const oldState = {
      currentUserId: "",
      layersStates: [{ id: "old", author: "old-user", channels: {} }],
      imagePanelIndex: 0,
    };

    const migrated = viewerStoreMigrate(oldState, 0);
    expect(migrated.layersStates).toEqual([]);
    expect(migrated.imagePanelIndex).toBe(-1);
    expect(migrated.currentUserId).toBe("");
  });

  it("resets to fallback for v4 state", () => {
    const v4State = {
      currentUserId: "user-a",
      layersStates: [{ id: "v4", author: "user-a", channels: {} }],
    };

    const migrated = viewerStoreMigrate(v4State, 4);
    expect(migrated.layersStates).toEqual([]);
  });

  it("returns fallback when migration throws", () => {
    const badState = null;
    const migrated = viewerStoreMigrate(badState, 2);
    expect(migrated.layersStates).toEqual([]);
    expect(migrated.currentUserId).toBe("");
  });

  it("fallback state includes all expected default fields", () => {
    const migrated = viewerStoreMigrate({}, 0);
    expect(migrated).toHaveProperty("selectedChannelId", null);
    expect(migrated).toHaveProperty("imagePanelIndex", -1);
    expect(migrated).toHaveProperty("imagePanels", []);
    expect(migrated).toHaveProperty("layersStates", []);
    expect(migrated).toHaveProperty("channels", {});
    expect(migrated).toHaveProperty("channelIds", []);
    expect(migrated).toHaveProperty("viewStateActive", null);
    expect(migrated).toHaveProperty("annotationClasses", []);
    expect(migrated).toHaveProperty("annotationActiveClass", null);
  });
});
