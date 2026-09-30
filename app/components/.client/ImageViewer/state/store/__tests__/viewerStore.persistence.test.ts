import { describe, expect, it, vi } from "vitest";

import { LEGACY_CLASSES_KEY } from "../annotations/annotations.store";
import {
  debouncedStorage,
  viewerStoreMerge,
  viewerStoreMigrate,
  viewerStorePartialize,
} from "../core/persistence";
import type { ViewerStore } from "../types";

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
    annotationClasses: {},
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
      layersStates: [
        makeLayersState("user-a"),
        makeLayersState("user-a"),
        makeLayersState("user-a"),
      ],
    });

    const result = viewerStorePartialize(state);
    expect(result.channels).toBe(channels);
    expect(result.channelIds).toEqual(["ch-1"]);
    expect(result.imagePanelIndex).toBe(2);
    expect(result.imagePanels).toEqual([0, 1, 2]);
  });

  it("clamps dangling panel pointers on rehydrate (pre-remap persisted state)", () => {
    // State persisted before the partialize remap: only the own view survived
    // the filter, but imagePanels still points at its pre-filter slot 1.
    const persisted = makeStoreState({
      imagePanelIndex: 0,
      imagePanels: [1],
      layersStates: [makeLayersState("user-a", { channels: { "ch-1": { color: [255, 0, 170] } } })],
    });

    const merged = viewerStoreMerge(persisted, makeStoreState());

    expect(merged.imagePanels).toEqual([0]);
    expect(merged.imagePanelIndex).toBe(0);
    expect(merged.layersStates).toHaveLength(1);
  });

  it("degrades to empty panels when no own views survived", () => {
    const persisted = makeStoreState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [makeLayersState("user-a")],
    });
    (persisted.layersStates as unknown[]).splice(0, 1);

    const merged = viewerStoreMerge(persisted, makeStoreState());

    expect(merged.imagePanels).toEqual([]);
    expect(merged.imagePanelIndex).toBe(-1);
  });

  it("falls back to the default class registry when persisted shape is not a per-set record", () => {
    // Persisted by an older checkout as a flat array; the record-consuming
    // main code must not treat set ids as array indices.
    const persisted = makeStoreState({
      annotationClasses: [{ name: "tumor", color: [255, 0, 0] }],
    } as unknown as Partial<ViewerStore>);

    const merged = viewerStoreMerge(persisted, makeStoreState());

    expect(merged.annotationClasses).toEqual({});
  });

  it("keeps persisted class registry when it is a valid per-set record", () => {
    const classes = {
      "set-1": [{ name: "tumor", color: [255, 0, 0] as [number, number, number] }],
    };
    const persisted = makeStoreState({ annotationClasses: classes });

    const merged = viewerStoreMerge(persisted, makeStoreState());

    expect(merged.annotationClasses).toEqual(classes);
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
    expect(migrated).toHaveProperty("annotationClasses", {});
    expect(migrated).toHaveProperty("annotationActiveClass", null);
  });

  // C-635: class registries became per annotation set. A legacy flat array is
  // wrapped under the legacy key (seedAnnotations adopts it into the first set
  // once real set ids are known); an already per-set record passes through.
  it("v6 → v7 wraps a legacy flat annotationClasses array under the legacy key", () => {
    const legacy = [{ name: "Tumor", color: [255, 0, 0] as [number, number, number] }];
    const migrated = viewerStoreMigrate({ annotationClasses: legacy }, 6);
    expect(migrated.annotationClasses).toEqual({ [LEGACY_CLASSES_KEY]: legacy });
  });

  it("v6 → v7 keeps an already per-set annotationClasses record", () => {
    const perSet = { "set-1": [{ name: "Tumor", color: [255, 0, 0] as [number, number, number] }] };
    const migrated = viewerStoreMigrate({ annotationClasses: perSet }, 6);
    expect(migrated.annotationClasses).toEqual(perSet);
  });
});

// Persist runs `partialize` + the storage's `setItem` on every store `set`.
// Stringifying synchronously there made every viewport frame / tile load a
// full JSON serialize of the (histogram-laden) viewer state; the debounced
// PersistStorage now defers the stringify to the flush.
describe("debouncedStorage stringify deferral", () => {
  it("defers stringify past the debounce and only writes once", () => {
    vi.useFakeTimers();
    localStorage.clear();
    const stringifySpy = vi.spyOn(JSON, "stringify");
    const base = stringifySpy.getMockImplementation();

    const pending = { state: { currentUserId: "user-a" }, version: 6 } as never;
    debouncedStorage.setItem("ViewerStore-defer-test", pending);

    // Not serialized nor written yet.
    expect(localStorage.getItem("ViewerStore-defer-test")).toBeNull();
    expect(stringifySpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);

    expect(stringifySpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem("ViewerStore-defer-test")!)).toEqual(pending);
    stringifySpy.mockImplementation(base ?? JSON.stringify);
    vi.useRealTimers();
  });

  it("round-trips a stored value through getItem", () => {
    localStorage.clear();
    const value = { state: { currentUserId: "user-a", channels: {} }, version: 6 } as never;
    debouncedStorage.setItem("ViewerStore-roundtrip-test", value);
    window.dispatchEvent(new Event("pagehide"));
    expect(debouncedStorage.getItem("ViewerStore-roundtrip-test")).toEqual(value);
  });
});
