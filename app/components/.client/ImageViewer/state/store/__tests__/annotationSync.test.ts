import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attachAnnotationSync } from "../annotationSync";
import type { createViewerStore } from "../createViewerStore";
import type { AnnotationFeature, AnnotationSet } from "~/utils/db/getAnnotationsWasm";
import { readAllAnnotations } from "~/utils/db/getAnnotationsWasm";
import { writeAnnotations } from "~/utils/db/writeAnnotationsWasm";

vi.mock("~/utils/db/getAnnotationsWasm", () => ({ readAllAnnotations: vi.fn() }));
vi.mock("~/utils/db/writeAnnotationsWasm", () => ({ writeAnnotations: vi.fn() }));

const readMock = vi.mocked(readAllAnnotations);
const writeMock = vi.mocked(writeAnnotations);

let featureSeq = 0;
const feature = (): AnnotationFeature => ({
  type: "Feature",
  id: `f${++featureSeq}`,
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: {},
});

const makeSet = (
  id: string,
  createdBy: string,
  features: AnnotationFeature[] = [],
): AnnotationSet => ({ id, createdBy, features });

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

interface FakeState {
  id: string;
  annotationSets: AnnotationSet[];
  seedAnnotations: (sets: AnnotationSet[]) => void;
}

/** Minimal stand-in for the subscribeWithSelector store: captures the listener
 *  so a test can fire it, and applies seed the way the real slice does. */
function makeFakeStore() {
  let listener: (() => void) | undefined;
  const state: FakeState = {
    id: "conn/slide.ome.tif",
    annotationSets: [],
    seedAnnotations: (sets) => {
      // Mirror the real slice: merge, installing only sets not already present.
      for (const set of sets) {
        if (!state.annotationSets.some((s) => s.id === set.id)) {
          state.annotationSets.push(set);
        }
      }
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
    /** Simulate a set change → the subscription fires the debounce. */
    fire: () => listener?.(),
  };
}

describe("attachAnnotationSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    readMock.mockReset();
    readMock.mockResolvedValue([]);
    writeMock.mockReset();
    writeMock.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("seeds the sets from the one-time read, without writing back", async () => {
    const seeded = [makeSet("set-1", "user-1", [feature()])];
    readMock.mockResolvedValue(seeded);
    const { store, state, fire } = makeFakeStore();

    attachAnnotationSync(store);
    await vi.runAllTimersAsync(); // settle the read → seed

    expect(state.annotationSets.find((s) => s.id === "set-1")?.features).toBe(seeded[0].features);
    fire(); // the seed's own subscription fire must diff to zero
    await vi.runAllTimersAsync();
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("keeps a pre-seed draw and schedules it for write (C-313 seed race)", async () => {
    // The read is slow; seed it with a stale version of the same set.
    let resolveRead: (v: AnnotationSet[]) => void = () => {};
    readMock.mockImplementation(
      () => new Promise<AnnotationSet[]>((resolve) => (resolveRead = resolve)),
    );
    const { store, state, fire } = makeFakeStore();

    attachAnnotationSync(store);

    // User draws BEFORE the read resolves.
    const drawn = [feature()];
    state.annotationSets = [makeSet("set-1", "user-1", drawn)];
    fire();

    // Now the one-time read resolves — the seed must NOT clobber the draw.
    resolveRead([makeSet("set-1", "user-1", [feature()])]);
    await vi.runAllTimersAsync();

    // In-memory draw survived the seed.
    expect(state.annotationSets.find((s) => s.id === "set-1")?.features).toBe(drawn);
    // And it is written: the baseline (read result) had no matching ref for it,
    // so the per-set diff schedules the pre-seed draw for persistence.
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith("conn/slide.ome.tif", "set-1", "user-1", drawn);
  });

  it("debounces an edit and writes only the changed set's sidecar", async () => {
    const { store, state, fire } = makeFakeStore();
    attachAnnotationSync(store);
    await vi.runAllTimersAsync();

    const features = [feature()];
    state.annotationSets = [makeSet("set-1", "user-1", features)]; // edit
    fire();
    expect(writeMock).not.toHaveBeenCalled(); // still within debounce
    await vi.runAllTimersAsync();

    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith("conn/slide.ome.tif", "set-1", "user-1", features);
  });

  it("does not create a file for a new set's empty features (lazy create)", async () => {
    const { store, state, fire } = makeFakeStore();
    attachAnnotationSync(store);
    await vi.runAllTimersAsync();

    state.annotationSets = [makeSet("set-1", "user-1", [])];
    fire();
    await vi.runAllTimersAsync();

    expect(writeMock).not.toHaveBeenCalled();
  });

  it("writes an empty set when that set's sidecar already existed (clear on delete-all)", async () => {
    readMock.mockResolvedValue([makeSet("set-1", "user-1", [feature()])]);
    const { store, state, fire } = makeFakeStore();
    attachAnnotationSync(store);
    await vi.runAllTimersAsync();

    state.annotationSets = [makeSet("set-1", "user-1", [])]; // delete all
    fire();
    await vi.runAllTimersAsync();

    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith("conn/slide.ome.tif", "set-1", "user-1", []);
  });

  it("leaves the baseline stale when a write fails, retrying on the next change", async () => {
    writeMock.mockRejectedValueOnce(new Error("network"));
    const { store, state, fire } = makeFakeStore();
    attachAnnotationSync(store);
    await vi.runAllTimersAsync();

    state.annotationSets = [makeSet("set-1", "user-1", [feature()])];
    fire();
    await vi.runAllTimersAsync(); // first write rejects → baseline not advanced

    fire(); // a later change re-attempts the still-diverged set
    await vi.runAllTimersAsync();

    expect(writeMock).toHaveBeenCalledTimes(2);
  });
});
