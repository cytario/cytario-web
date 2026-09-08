import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { connectionIsReadOnly } from "../../../utils/useCanAnnotate";
import type { createViewerStore } from "../createViewerStore";
import type { LayersStateEntry } from "../types";
import { attachViewSync } from "../viewSync";
import type { ViewSettingsEntry } from "~/utils/db/viewSettingsSchema";
import { readViewSettings, writeViewSettings } from "~/utils/db/writeViewSettings";

vi.mock("~/utils/db/writeViewSettings", () => ({
  readViewSettings: vi.fn(),
  writeViewSettings: vi.fn(),
}));

vi.mock("../../../utils/useCanAnnotate", () => ({
  connectionIsReadOnly: vi.fn(),
}));

const readMock = vi.mocked(readViewSettings);
const writeMock = vi.mocked(writeViewSettings);
const readOnlyMock = vi.mocked(connectionIsReadOnly);

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

interface FakeState {
  id: string;
  currentUserId: string;
  layersStates: LayersStateEntry[];
  loadSharedViews: (entries: ViewSettingsEntry[]) => void;
  shareView: (index: number) => void;
  unshareView: (index: number) => void;
}

function makeEntry(overrides: Partial<LayersStateEntry> = {}): LayersStateEntry {
  return {
    id: crypto.randomUUID(),
    author: "user-123",
    channels: {},
    overlays: {},
    channelsOpacity: 1,
    overlaysFillOpacity: 0.8,
    showCellOutline: true,
    annotationsOpacity: 1,
    showAnnotationOutline: true,
    isChannelsLoading: 0,
    isOverlaysLoading: 0,
    shared: false,
    ...overrides,
  };
}

function makeFakeStore(userId = "user-123") {
  let listener: (() => void) | undefined;
  const state: FakeState = {
    id: "conn/slide.ome.tif",
    currentUserId: userId,
    layersStates: [makeEntry()],
    loadSharedViews: (entries) => {
      for (const entry of entries) {
        const existing = state.layersStates.find((ls) => ls.id === entry.id);
        if (existing) {
          Object.assign(existing, { ...entry, isChannelsLoading: 0, isOverlaysLoading: 0 });
        } else {
          state.layersStates.push({
            id: entry.id,
            author: "user-123",
            channels: {},
            overlays: {},
            channelsOpacity: entry.channelsOpacity,
            overlaysFillOpacity: entry.overlaysFillOpacity,
            showCellOutline: entry.showCellOutline,
            annotationsOpacity: entry.annotationsOpacity,
            showAnnotationOutline: entry.showAnnotationOutline,
            isChannelsLoading: 0,
            isOverlaysLoading: 0,
            name: entry.name,
            shared: entry.shared,
          });
        }
      }
    },
    shareView: (index) => {
      if (state.layersStates[index]) state.layersStates[index].shared = true;
    },
    unshareView: (index) => {
      if (state.layersStates[index]) state.layersStates[index].shared = false;
    },
  };
  const store = {
    getState: () => state,
    subscribe: (_selector: unknown, cb: () => void) => {
      listener = cb;
      return () => {};
    },
  };
  return {
    store: store as unknown as ViewerStoreApi,
    state,
    fire: () => listener?.(),
  };
}

function makeSidecarEntry(id: string, name?: string): ViewSettingsEntry {
  return {
    id,
    author: "user-123",
    name,
    shared: true,
    channels: {},
    channelsOpacity: 1,
    overlays: {},
    overlaysFillOpacity: 0.8,
    showCellOutline: true,
    annotationsOpacity: 1,
    showAnnotationOutline: true,
  };
}

describe("attachViewSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    readMock.mockReset();
    readMock.mockResolvedValue([]);
    writeMock.mockReset();
    writeMock.mockResolvedValue(undefined);
    readOnlyMock.mockReset();
    readOnlyMock.mockReturnValue(false);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads shared views from S3 on attach", async () => {
    const entries = [makeSidecarEntry("view-1", "Shared View")];
    readMock.mockResolvedValue(entries);
    const { store, state } = makeFakeStore();

    attachViewSync(store);
    await vi.runAllTimersAsync();

    expect(state.layersStates.some((ls) => ls.id === "view-1")).toBe(true);
  });

  it("does not write when no views are shared", async () => {
    const { store, fire } = makeFakeStore();

    attachViewSync(store);
    await vi.runAllTimersAsync();

    fire();
    await vi.runAllTimersAsync();

    expect(writeMock).not.toHaveBeenCalled();
  });

  it("recovers when the connections store hydrates after attach", async () => {
    // On a hard reload the viewer renders before the layout's init effect
    // populates the connections store, so early flushes may fail closed. The
    // gate re-evaluates on every flush, so the next state change writes.
    readOnlyMock.mockReturnValueOnce(true).mockReturnValue(false);

    const { store, state, fire } = makeFakeStore();

    attachViewSync(store);
    await vi.runAllTimersAsync();

    state.shareView(0);
    fire();
    await vi.runAllTimersAsync();
    expect(writeMock).not.toHaveBeenCalled();

    // A later state change re-flushes; the store has hydrated by then.
    state.layersStates[0].channelsOpacity = 0.5;
    fire();
    await vi.runAllTimersAsync();

    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("writes shared views to S3 after debounce when a view is shared", async () => {
    const { store, state, fire } = makeFakeStore();

    attachViewSync(store);
    await vi.runAllTimersAsync();

    state.shareView(0);
    fire();
    await vi.runAllTimersAsync();

    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith(
      "conn/slide.ome.tif",
      "user-123",
      expect.arrayContaining([expect.objectContaining({ shared: true })]),
    );
  });

  it("does not write when shared views are unchanged (baseline diff)", async () => {
    const entry = makeEntry({ shared: true });
    const sidecarEntry = makeSidecarEntry(entry.id);
    readMock.mockResolvedValue([sidecarEntry]);

    const { store, fire } = makeFakeStore();
    store.getState().layersStates = [entry];

    attachViewSync(store);
    await vi.runAllTimersAsync();

    fire();
    await vi.runAllTimersAsync();

    expect(writeMock).not.toHaveBeenCalled();
  });

  it("stops writing after a view is unshared (no prior persisted sidecar)", async () => {
    const entry = makeEntry({ shared: true });
    const { store, state, fire } = makeFakeStore();
    store.getState().layersStates = [entry];

    attachViewSync(store);
    await vi.runAllTimersAsync();

    writeMock.mockClear();
    state.unshareView(0);
    fire();
    await vi.runAllTimersAsync();

    // persisted is empty, so the subscriber does not schedule a flush —
    // nothing to clear on S3.
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("writes nothing on a read-only connection and still loads shared views", async () => {
    readOnlyMock.mockReturnValue(true);
    const entries = [makeSidecarEntry("view-1", "Shared View")];
    readMock.mockResolvedValue(entries);

    const { store, state, fire } = makeFakeStore();

    attachViewSync(store);
    await vi.runAllTimersAsync();

    state.shareView(0);
    fire();
    await vi.runAllTimersAsync();

    expect(state.layersStates.some((ls) => ls.id === "view-1")).toBe(true);
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("clears the sidecar when the last shared view is unshared after a prior persist", async () => {
    const entry = makeEntry({ shared: true });
    const sidecarEntry = makeSidecarEntry(entry.id);
    readMock.mockResolvedValue([sidecarEntry]);

    const { store, state, fire } = makeFakeStore();
    store.getState().layersStates = [entry];

    attachViewSync(store);
    await vi.runAllTimersAsync();

    writeMock.mockClear();
    state.unshareView(0);
    fire();
    await vi.runAllTimersAsync();

    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith("conn/slide.ome.tif", "user-123", []);
  });
});
