import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attachAnnotationSync } from "../annotationSync";
import type { createViewerStore } from "../createViewerStore";
import type { AnnotationFeature, AnnotationsByUser } from "~/utils/db/getAnnotationsWasm";
import { readAllAnnotations } from "~/utils/db/getAnnotationsWasm";
import { writeAnnotations } from "~/utils/db/writeAnnotationsWasm";

vi.mock("~/utils/db/getAnnotationsWasm", () => ({ readAllAnnotations: vi.fn() }));
vi.mock("~/utils/db/writeAnnotationsWasm", () => ({ writeAnnotations: vi.fn() }));

const readMock = vi.mocked(readAllAnnotations);
const writeMock = vi.mocked(writeAnnotations);

const feature = (): AnnotationFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: {},
});

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

interface FakeState {
  id: string;
  annotationsByUser: AnnotationsByUser;
  seedAnnotations: (byUser: AnnotationsByUser) => void;
}

/** Minimal stand-in for the subscribeWithSelector store: captures the listener
 *  so a test can fire it, and applies seed the way the real slice does. */
function makeFakeStore() {
  let listener: (() => void) | undefined;
  const state: FakeState = {
    id: "conn/slide.ome.tif",
    annotationsByUser: {},
    seedAnnotations: (byUser) => {
      state.annotationsByUser = byUser;
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
    /** Simulate a map change → the subscription fires the debounce. */
    fire: () => listener?.(),
  };
}

describe("attachAnnotationSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    readMock.mockReset();
    readMock.mockResolvedValue({});
    writeMock.mockReset();
    writeMock.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("seeds the per-user map from the one-time read, without writing back", async () => {
    const seeded = { "user-1": [feature()] };
    readMock.mockResolvedValue(seeded);
    const { store, state, fire } = makeFakeStore();

    attachAnnotationSync(store);
    await vi.runAllTimersAsync(); // settle the read → seed

    expect(state.annotationsByUser).toBe(seeded);
    fire(); // the seed's own subscription fire must diff to zero
    await vi.runAllTimersAsync();
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("debounces an edit and writes only the changed user's sidecar", async () => {
    const { store, state, fire } = makeFakeStore();
    attachAnnotationSync(store);
    await vi.runAllTimersAsync();

    const features = [feature()];
    state.annotationsByUser = { "user-1": features }; // edit
    fire();
    expect(writeMock).not.toHaveBeenCalled(); // still within debounce
    await vi.runAllTimersAsync();

    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith("conn/slide.ome.tif", "user-1", features);
  });

  it("does not create a file for a new user's empty set (lazy create)", async () => {
    const { store, state, fire } = makeFakeStore();
    attachAnnotationSync(store);
    await vi.runAllTimersAsync();

    state.annotationsByUser = { "user-1": [] };
    fire();
    await vi.runAllTimersAsync();

    expect(writeMock).not.toHaveBeenCalled();
  });

  it("writes an empty set when that user's sidecar already existed (clear on delete-all)", async () => {
    readMock.mockResolvedValue({ "user-1": [feature()] });
    const { store, state, fire } = makeFakeStore();
    attachAnnotationSync(store);
    await vi.runAllTimersAsync();

    state.annotationsByUser = { "user-1": [] }; // delete all
    fire();
    await vi.runAllTimersAsync();

    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith("conn/slide.ome.tif", "user-1", []);
  });

  it("leaves the baseline stale when a write fails, retrying on the next change", async () => {
    writeMock.mockRejectedValueOnce(new Error("network"));
    const { store, state, fire } = makeFakeStore();
    attachAnnotationSync(store);
    await vi.runAllTimersAsync();

    state.annotationsByUser = { "user-1": [feature()] };
    fire();
    await vi.runAllTimersAsync(); // first write rejects → baseline not advanced

    fire(); // a later change re-attempts the still-diverged user
    await vi.runAllTimersAsync();

    expect(writeMock).toHaveBeenCalledTimes(2);
  });
});
