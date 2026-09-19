import { beforeEach, describe, expect, test, vi } from "vitest";

import { createViewerStore } from "../createViewerStore";

// The debounced persist storage coalesces viewport-frame writes, but a reload
// right after a state change must still find the latest state persisted —
// pagehide flushes pending writes before the storage goes away.
describe("viewer store debounced persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  test("a change followed by pagehide is persisted without waiting for the debounce", () => {
    vi.useFakeTimers();
    const store = createViewerStore("debounce-flush-test", "user-1");

    store.getState().setSelectedChannelId("channel-changed");
    // No debounce tick yet — the write is still pending.
    expect(localStorage.getItem("ViewerStore-debounce-flush-test")).toBeNull();

    window.dispatchEvent(new Event("pagehide"));

    const persisted = JSON.parse(localStorage.getItem("ViewerStore-debounce-flush-test")!) as {
      state: { selectedChannelId: string | null };
    };
    expect(persisted.state.selectedChannelId).toBe("channel-changed");
    vi.useRealTimers();
  });

  test("rapid sets coalesce into one write after the debounce", () => {
    vi.useFakeTimers();
    const store = createViewerStore("debounce-coalesce-test", "user-1");
    const setItemSpy = vi.spyOn(localStorage, "setItem");

    for (let i = 0; i < 10; i++) {
      store.getState().setSelectedChannelId(`channel-${i}`);
    }
    expect(setItemSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(setItemSpy).toHaveBeenCalledTimes(1);

    const persisted = JSON.parse(localStorage.getItem("ViewerStore-debounce-coalesce-test")!) as {
      state: { selectedChannelId: string | null };
    };
    expect(persisted.state.selectedChannelId).toBe("channel-9");
    vi.useRealTimers();
  });
});

describe("viewerStorePartialize panel-pointer remap", () => {
  const mockLayersState = (author: string, shared: boolean) => ({
    id: crypto.randomUUID(),
    author,
    shared,
    channels: {},
    overlays: {},
    channelsOpacity: 1,
    overlaysFillOpacity: 0.8,
    showCellOutline: true,
    annotationsOpacity: 1,
    showAnnotationOutline: true,
    isChannelsLoading: 0,
    isOverlaysLoading: 0,
  });

  const persistNow = (id: string) => {
    window.dispatchEvent(new Event("pagehide"));
    return JSON.parse(localStorage.getItem(`ViewerStore-${id}`)!) as {
      state: { imagePanelIndex: number; imagePanels: number[]; layersStates: { author: string }[] };
    };
  };

  test("remaps panel pointers when peer views are filtered out of the persist", () => {
    // A peer view below the own view pushes the own view to index 1; the
    // filtered persist must keep the panel pointing at the own view.
    const store = createViewerStore("partialize-remap-test", "user-self");
    const peer = mockLayersState("other-user", true);
    const own = mockLayersState("user-self", false);

    store.setState({ layersStates: [peer, own], imagePanels: [1], imagePanelIndex: 0 });
    const persisted = persistNow("partialize-remap-test");

    expect(persisted.state.layersStates).toHaveLength(1);
    expect(persisted.state.imagePanels).toEqual([0]);
    expect(persisted.state.imagePanelIndex).toBe(0);
  });

  test("a panel pointing at a peer view falls back to the first own view", () => {
    const store = createViewerStore("partialize-peer-panel-test", "user-self");
    const peer = mockLayersState("other-user", true);
    const own = mockLayersState("user-self", false);

    store.setState({ layersStates: [peer, own], imagePanels: [0, 1], imagePanelIndex: 0 });
    const persisted = persistNow("partialize-peer-panel-test");

    expect(persisted.state.imagePanels).toEqual([0, 0]);
    expect(persisted.state.imagePanelIndex).toBe(0);
  });

  test("with no own views the pointers degrade to -1 instead of dangling", () => {
    const store = createViewerStore("partialize-no-own-test", "user-self");
    const peer = mockLayersState("other-user", true);

    store.setState({ layersStates: [peer], imagePanels: [0], imagePanelIndex: 0 });
    const persisted = persistNow("partialize-no-own-test");

    expect(persisted.state.layersStates).toHaveLength(0);
    expect(persisted.state.imagePanels).toEqual([-1]);
    expect(persisted.state.imagePanelIndex).toBe(0);
  });
});
