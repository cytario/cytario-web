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
