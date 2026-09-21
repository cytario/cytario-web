import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../../../state/store/core/ViewerStoreContext", async () => {
  const { createContext } = await import("react");
  return {
    ViewerStoreContext: createContext<ViewerStoreApi | null>(null),
  };
});

vi.mock("../../../utils/useCanAnnotate", () => ({
  useCanAnnotate: vi.fn(),
}));

import type { ViewerStoreApi } from "../../../state/store/core/viewerRegistry";
import { ViewerStoreContext } from "../../../state/store/core/ViewerStoreContext";
import { createViewerStore } from "../../../state/store/createViewerStore";
import { useCanAnnotate } from "../../../utils/useCanAnnotate";
import { useAnnotationDuplicateShortcuts } from "../useAnnotationDuplicateShortcuts";
import type { AnnotationFeature } from "~/utils/db/annotationSchema";

const mockCanAnnotate = vi.mocked(useCanAnnotate);

let featureSeq = 0;
const makeFeature = (overrides?: {
  id?: string;
  className?: string;
  name?: string;
}): AnnotationFeature => ({
  type: "Feature",
  id: overrides?.id ?? `feat-${++featureSeq}`,
  geometry: { type: "Point", coordinates: [100, 100] },
  properties: {
    ...(overrides?.name ? { name: overrides.name } : {}),
    ...(overrides?.className
      ? { classification: { name: overrides.className, color: [255, 0, 0] } }
      : {}),
  },
});

const fireKey = (key: string, opts: Record<string, unknown> = {}) => {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      ...opts,
    }),
  );
};

const fireKeyOn = (target: Element, key: string) => {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true }),
  );
};

const Harness = () => {
  useAnnotationDuplicateShortcuts();
  return null;
};

const renderShortcuts = (store: ViewerStoreApi) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <ViewerStoreContext.Provider value={store as any}>{children}</ViewerStoreContext.Provider>
  );
  render(
    <Wrapper>
      <Harness />
    </Wrapper>,
  );
};

const seedViewer = (store: ViewerStoreApi, features: AnnotationFeature[]) => {
  act(() => {
    store.getState().seedAnnotations([
      {
        id: "set-a",
        createdBy: "user-a",
        features,
        name: undefined,
      },
    ]);
  });
};

const setSelection = (store: ViewerStoreApi, ids: string[]) => {
  act(() => store.getState().setAnnotationSelectedIds(ids));
};

const featureCount = (store: ViewerStoreApi): number =>
  store.getState().annotationSets.find((s) => s.id === "set-a")!.features.length;

describe("useAnnotationDuplicateShortcuts", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("Cmd/Ctrl+D duplicates the selection in place and replaces the selection", () => {
    mockCanAnnotate.mockReturnValue(true);
    const store = createViewerStore("dupkey-1");
    const source = makeFeature({ id: "src-1", className: "Tumor" });
    seedViewer(store, [source]);
    setSelection(store, ["src-1"]);
    renderShortcuts(store);

    fireKey("d");

    const state = store.getState();
    const features = state.annotationSets.find((s) => s.id === "set-a")!.features;
    expect(features).toHaveLength(2);
    expect(features[1].geometry).toEqual(source.geometry);
    expect(features[1].properties.classification).toEqual(source.properties.classification);
    expect(state.annotationSelectedIds).toEqual([features[1].id]);
  });

  test("Cmd/Ctrl+C then Cmd/Ctrl+V pastes an offset duplicate; repeated pastes stack", () => {
    mockCanAnnotate.mockReturnValue(true);
    const store = createViewerStore("dupkey-2");
    const source = makeFeature({ id: "src-1" });
    source.geometry = { type: "Point", coordinates: [100, 100] };
    seedViewer(store, [source]);
    setSelection(store, ["src-1"]);
    act(() => {
      store.getState().setViewStateActive({
        zoom: 0,
        width: 800,
        height: 600,
        target: [0, 0],
        rotationX: 90,
        rotationOrbit: 0,
        minRotationX: -90,
        maxRotationX: 90,
        minZoom: -10,
        maxZoom: 2,
        transitionDuration: 0,
      } as never);
    });
    renderShortcuts(store);

    fireKey("c");
    fireKey("v");

    // zoom 0 → 1 world unit per px; min(w,h)=600; 2.5% → delta 15.
    let features = store.getState().annotationSets.find((s) => s.id === "set-a")!.features;
    expect(features).toHaveLength(2);
    expect(features[1].geometry).toEqual({ type: "Point", coordinates: [115, 115] });

    fireKey("v");

    features = store.getState().annotationSets.find((s) => s.id === "set-a")!.features;
    expect(features).toHaveLength(3);
    expect(features[2].geometry).toEqual({ type: "Point", coordinates: [130, 130] });
  });

  test("Cmd/Ctrl+V without a prior copy is a no-op", () => {
    mockCanAnnotate.mockReturnValue(true);
    const store = createViewerStore("dupkey-3");
    seedViewer(store, [makeFeature({ id: "src-1" })]);
    setSelection(store, ["src-1"]);
    renderShortcuts(store);

    fireKey("v");

    expect(featureCount(store)).toBe(1);
  });

  test("is suppressed while focus is in a form field", () => {
    mockCanAnnotate.mockReturnValue(true);
    const store = createViewerStore("dupkey-4");
    seedViewer(store, [makeFeature({ id: "src-1" })]);
    setSelection(store, ["src-1"]);
    renderShortcuts(store);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireKeyOn(input, "d");
    input.remove();

    expect(featureCount(store)).toBe(1);
  });

  test("is suppressed on read-only connections", () => {
    mockCanAnnotate.mockReturnValue(false);
    const store = createViewerStore("dupkey-5");
    seedViewer(store, [makeFeature({ id: "src-1" })]);
    setSelection(store, ["src-1"]);
    renderShortcuts(store);

    fireKey("d");

    expect(featureCount(store)).toBe(1);
  });

  test("is suppressed while the key repeats", () => {
    mockCanAnnotate.mockReturnValue(true);
    const store = createViewerStore("dupkey-6");
    seedViewer(store, [makeFeature({ id: "src-1" })]);
    setSelection(store, ["src-1"]);
    renderShortcuts(store);

    fireKey("d", { repeat: true });

    expect(featureCount(store)).toBe(1);
  });

  test("a live text selection owns Cmd/Ctrl+C — the clipboard stays empty", () => {
    mockCanAnnotate.mockReturnValue(true);
    const store = createViewerStore("dupkey-7");
    seedViewer(store, [makeFeature({ id: "src-1" })]);
    setSelection(store, ["src-1"]);
    renderShortcuts(store);

    vi.spyOn(document, "getSelection").mockReturnValue({
      toString: () => "selected text",
    } as Selection);
    fireKey("c");
    vi.restoreAllMocks();

    fireKey("v");

    expect(featureCount(store)).toBe(1);
  });

  test("unrelated modifier keys are ignored", () => {
    mockCanAnnotate.mockReturnValue(true);
    const store = createViewerStore("dupkey-8");
    seedViewer(store, [makeFeature({ id: "src-1" })]);
    setSelection(store, ["src-1"]);
    renderShortcuts(store);

    fireKey("x");

    expect(featureCount(store)).toBe(1);
  });
});
