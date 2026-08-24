import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { createViewerStore } from "../createViewerStore";
import type { LayersStateEntry } from "../types";
import { attachViewSync } from "../viewSync";
import type { ViewSettingsEntry } from "~/utils/db/viewSettingsSchema";
import { readViewSettings, writeViewSettings } from "~/utils/db/writeViewSettings";

vi.mock("~/utils/db/writeViewSettings", () => ({
  readViewSettings: vi.fn(),
  writeViewSettings: vi.fn(),
}));

const readMock = vi.mocked(readViewSettings);
const writeMock = vi.mocked(writeViewSettings);

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

interface FakeState {
  id: string;
  layersStates: LayersStateEntry[];
  loadSharedViews: (entries: ViewSettingsEntry[]) => void;
  shareView: (index: number) => void;
  unshareView: (index: number) => void;
}

function makeEntry(overrides: Partial<LayersStateEntry> = {}): LayersStateEntry {
  return {
    id: crypto.randomUUID(),
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

function makeFakeStore() {
  let listener: (() => void) | undefined;
  const state: FakeState = {
    id: "conn/slide.ome.tif",
    layersStates: [makeEntry()],
    loadSharedViews: (entries) => {
      for (const entry of entries) {
        const existing = state.layersStates.find((ls) => ls.id === entry.id);
        if (existing) {
          Object.assign(existing, { ...entry, isChannelsLoading: 0, isOverlaysLoading: 0 });
        } else {
          state.layersStates.push({
            id: entry.id,
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
    readMock.mockResolvedValue(null);
    writeMock.mockReset();
    writeMock.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads shared views from S3 on attach", async () => {
    const entries = [makeSidecarEntry("view-1", "Shared View")];
    readMock.mockResolvedValue({
      cytario: { schemaVersion: "1.0", kind: "settings", image: "s3://conn/slide.ome.tif" },
      views: entries,
    });
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
      expect.arrayContaining([expect.objectContaining({ shared: true })]),
    );
  });

  it("does not write when shared views are unchanged (baseline diff)", async () => {
    const entry = makeEntry({ shared: true });
    const sidecarEntry = makeSidecarEntry(entry.id);
    readMock.mockResolvedValue({
      cytario: { schemaVersion: "1.0", kind: "settings", image: "s3://conn/slide.ome.tif" },
      views: [sidecarEntry],
    });

    const { store, fire } = makeFakeStore();
    store.getState().layersStates = [entry];

    attachViewSync(store);
    await vi.runAllTimersAsync();

    fire();
    await vi.runAllTimersAsync();

    expect(writeMock).not.toHaveBeenCalled();
  });

  it("stops writing after a view is unshared", async () => {
    const entry = makeEntry({ shared: true });
    const { store, state, fire } = makeFakeStore();
    store.getState().layersStates = [entry];

    attachViewSync(store);
    await vi.runAllTimersAsync();

    writeMock.mockClear();
    state.unshareView(0);
    fire();
    await vi.runAllTimersAsync();

    expect(writeMock).not.toHaveBeenCalled();
  });
});
