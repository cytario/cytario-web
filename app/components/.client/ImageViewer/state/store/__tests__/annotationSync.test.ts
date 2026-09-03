import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attachAnnotationSync } from "../annotationSync";
import type { createViewerStore } from "../createViewerStore";
import { deleteAnnotations } from "~/utils/db/deleteAnnotations";
import type { AnnotationFeature, AnnotationSet } from "~/utils/db/getAnnotationsWasm";
import { readAllAnnotations } from "~/utils/db/getAnnotationsWasm";
import { writeAnnotations } from "~/utils/db/writeAnnotationsWasm";

vi.mock("~/utils/db/getAnnotationsWasm", () => ({ readAllAnnotations: vi.fn() }));
vi.mock("~/utils/db/writeAnnotationsWasm", () => ({ writeAnnotations: vi.fn() }));
vi.mock("~/utils/db/deleteAnnotations", () => ({ deleteAnnotations: vi.fn() }));

const readMock = vi.mocked(readAllAnnotations);
const writeMock = vi.mocked(writeAnnotations);
const deleteMock = vi.mocked(deleteAnnotations);

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
): AnnotationSet => ({ id, createdBy, features, name: undefined });

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
    deleteMock.mockReset();
    deleteMock.mockResolvedValue(undefined);
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
    expect(writeMock).toHaveBeenCalledWith(
      "conn/slide.ome.tif",
      "set-1",
      "user-1",
      drawn,
      undefined,
    );
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
    expect(writeMock).toHaveBeenCalledWith(
      "conn/slide.ome.tif",
      "set-1",
      "user-1",
      features,
      undefined,
    );
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
    expect(writeMock).toHaveBeenCalledWith("conn/slide.ome.tif", "set-1", "user-1", [], undefined);
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

// C-456: a set present in the persisted baseline but removed from the working
// copy was deleted — its sidecar file is DELETEd from S3.
describe("attachAnnotationSync — set deletion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    readMock.mockReset();
    readMock.mockResolvedValue([]);
    writeMock.mockReset();
    writeMock.mockResolvedValue(undefined);
    deleteMock.mockReset();
    deleteMock.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("deletes the sidecar of a set removed from the working copy", async () => {
    readMock.mockResolvedValue([makeSet("set-1", "user-1", [feature()])]);
    const { store, state, fire } = makeFakeStore();
    attachAnnotationSync(store);
    await vi.runAllTimersAsync(); // settle the read → seed → baseline

    // The set is deleted (the fake store's slice shape doesn't matter here —
    // the sync only looks at annotationSets membership).
    state.annotationSets = [];
    fire();
    await vi.runAllTimersAsync();

    expect(deleteMock).toHaveBeenCalledWith("conn/slide.ome.tif", "set-1");
    // Baseline dropped → no repeated DELETE on later flushes.
    fire();
    await vi.runAllTimersAsync();
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  it("does not delete a set that was never persisted (created and deleted before any flush)", async () => {
    readMock.mockResolvedValue([]);
    const { store, state, fire } = makeFakeStore();
    attachAnnotationSync(store);
    await vi.runAllTimersAsync();

    // Draw (create) and delete before the debounce ever fires.
    state.annotationSets = [makeSet("set-1", "user-1", [feature()])];
    fire();
    state.annotationSets = [];
    fire();
    await vi.runAllTimersAsync();

    expect(writeMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("keeps the baseline entry on a failed delete so it retries on the next flush", async () => {
    readMock.mockResolvedValue([makeSet("set-1", "user-1", [feature()])]);
    deleteMock.mockRejectedValueOnce(new Error("403"));
    const { store, state, fire } = makeFakeStore();
    attachAnnotationSync(store);
    await vi.runAllTimersAsync();

    state.annotationSets = [];
    fire();
    await vi.runAllTimersAsync();
    expect(deleteMock).toHaveBeenCalledTimes(1); // failed, baseline retained

    fire();
    await vi.runAllTimersAsync();
    expect(deleteMock).toHaveBeenCalledTimes(2); // retried and resolved
  });

  it("re-writes the sidecar when a delete is undone before the flush", async () => {
    readMock.mockResolvedValue([makeSet("set-1", "user-1", [feature()])]);
    const { store, state, fire } = makeFakeStore();
    attachAnnotationSync(store);
    await vi.runAllTimersAsync();

    // Delete, then undo (set restored with a fresh features ref) before the
    // debounce fires — the flush must PUT the set back, not DELETE it.
    state.annotationSets = [];
    fire();
    state.annotationSets = [makeSet("set-1", "user-1", [feature()])];
    fire();
    await vi.runAllTimersAsync();

    expect(deleteMock).not.toHaveBeenCalled();
    expect(writeMock).toHaveBeenCalledWith(
      "conn/slide.ome.tif",
      "set-1",
      "user-1",
      expect.anything(),
      undefined,
    );
  });
});

// C-457: a display-name change alone (features ref unchanged) must still
// diff → write the sidecar with cytario.name.
describe("attachAnnotationSync — set rename", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    readMock.mockReset();
    readMock.mockResolvedValue([]);
    writeMock.mockReset();
    writeMock.mockResolvedValue(undefined);
    deleteMock.mockReset();
    deleteMock.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the sidecar when only the name changed", async () => {
    const seeded = [makeSet("set-1", "user-1", [feature()])];
    seeded[0].name = "Old name";
    readMock.mockResolvedValue(seeded);
    const { store, state, fire } = makeFakeStore();
    attachAnnotationSync(store);
    await vi.runAllTimersAsync();

    // Rename without touching the features array reference.
    state.annotationSets[0].name = "New name";
    fire();
    await vi.runAllTimersAsync();

    expect(writeMock).toHaveBeenCalledWith(
      "conn/slide.ome.tif",
      "set-1",
      "user-1",
      seeded[0].features,
      "New name",
    );
  });
});
