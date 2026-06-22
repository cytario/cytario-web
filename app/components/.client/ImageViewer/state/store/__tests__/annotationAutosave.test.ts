import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attachAnnotationAutosave } from "../annotationAutosave";
import type { createViewerStore } from "../createViewerStore";
import { writeAnnotations } from "~/utils/db/writeAnnotationsWasm";

vi.mock("~/utils/db/writeAnnotationsWasm", () => ({ writeAnnotations: vi.fn() }));

const writeMock = vi.mocked(writeAnnotations);

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

interface FakeState {
  id: string;
  annotationOwnerId: string | null;
  annotationFeatures: unknown[];
  annotationsDirty: boolean;
  annotationSidecarExists: boolean;
  markAnnotationsSaved: () => void;
}

/** Minimal stand-in for the subscribeWithSelector store: captures the listener
 *  so a test can fire it, and lets the writer's action mutate the state. */
function makeFakeStore(overrides: Partial<FakeState> = {}) {
  let listener: (() => void) | undefined;
  const state: FakeState = {
    id: "conn/slide.ome.tif",
    annotationOwnerId: "user-1",
    annotationFeatures: [],
    annotationsDirty: false,
    annotationSidecarExists: false,
    markAnnotationsSaved: () => {
      state.annotationSidecarExists = true;
      state.annotationsDirty = false;
    },
    ...overrides,
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
    /** Simulate a feature-set change → the subscription fires the debounce. */
    fire: () => listener?.(),
  };
}

describe("attachAnnotationAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    writeMock.mockReset();
    writeMock.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces, writes the owner's sidecar, and marks saved", async () => {
    const { store, state, fire } = makeFakeStore({
      annotationFeatures: [{ a: 1 }],
      annotationsDirty: true,
    });
    attachAnnotationAutosave(store);

    fire();
    expect(writeMock).not.toHaveBeenCalled(); // still within debounce
    await vi.runAllTimersAsync();

    expect(writeMock).toHaveBeenCalledWith(
      "conn/slide.ome.tif",
      "user-1",
      state.annotationFeatures,
    );
    expect(state.annotationsDirty).toBe(false);
    expect(state.annotationSidecarExists).toBe(true);
  });

  it("does not create a file for an empty set when no sidecar exists (lazy create)", async () => {
    const { store, fire } = makeFakeStore({
      annotationFeatures: [],
      annotationsDirty: true,
      annotationSidecarExists: false,
    });
    attachAnnotationAutosave(store);

    fire();
    await vi.runAllTimersAsync();

    expect(writeMock).not.toHaveBeenCalled();
  });

  it("writes an empty set when the sidecar already exists (clear on delete-all)", async () => {
    const { store, fire } = makeFakeStore({
      annotationFeatures: [],
      annotationsDirty: true,
      annotationSidecarExists: true,
    });
    attachAnnotationAutosave(store);

    fire();
    await vi.runAllTimersAsync();

    expect(writeMock).toHaveBeenCalledTimes(1);
  });

  it("leaves dirty set when the write fails (retry on next change)", async () => {
    writeMock.mockRejectedValueOnce(new Error("network"));
    const { store, state, fire } = makeFakeStore({
      annotationFeatures: [{ a: 1 }],
      annotationsDirty: true,
    });
    attachAnnotationAutosave(store);

    fire();
    await vi.runAllTimersAsync();

    expect(state.annotationsDirty).toBe(true);
  });
});
