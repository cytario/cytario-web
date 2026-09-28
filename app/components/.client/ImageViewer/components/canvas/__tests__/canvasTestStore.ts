import { act } from "@testing-library/react";
import { useStore } from "zustand";

import { createViewerStore } from "../../../state/store/createViewerStore";
import type { ViewerStore } from "../../../state/store/types";
import { seedViewerConnection } from "~/utils/__tests__/__mocks__";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

/** Per-file store holder — hand to {@link viewerStoreContextMock} via the
 *  test file's `vi.mock` factory. */
export interface StoreRef {
  current: ReturnType<typeof createViewerStore> | undefined;
}

/** The `useViewerStore`/`useViewerStoreApi` module mock shared by canvas-hook
 *  tests; the importing file keeps the `vi.mock` call (hoisting) and assigns
 *  `ref.current` from {@link createCanvasTestStore}. */
export const viewerStoreContextMock = (ref: StoreRef) => ({
  useViewerStore: <T>(selector: (state: ViewerStore) => T): T =>
    useStore(ref.current as ReturnType<typeof createViewerStore>, selector),
  useViewerStoreApi: () => ref.current,
});

export const makeFeature = (id: string, className?: string): AnnotationFeature => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: {
    ...(className ? { classification: { name: className, color: [255, 0, 0] } } : {}),
  },
});

/** Sidecar seed + fresh store + own set + view mode — the standard canvas-hook
 *  setup. Returns the set id for feature fixtures. */
export const createCanvasTestStore = (userId = "user-a") => {
  seedViewerConnection("test-conn");
  const store = createViewerStore(`test-conn/images/slide-${Math.random()}.ome.tif`, userId);
  const setId = store.getState().ensureOwnSet();
  store.getState().setAnnotationMode("view");
  return { store, setId };
};

/** Open the popup in the store (act-wrapped — direct store writes outside
 *  React events don't flush). */
export const openTestPopup = (
  store: ReturnType<typeof createViewerStore>,
  overrides: Partial<Parameters<ViewerStore["openPopup"]>[0]> = {},
) =>
  act(() =>
    store.getState().openPopup({
      panelId: 0,
      anchor: { x: 0, y: 0 },
      sections: { Annotations: [{ type: "Annotations", values: {} }] },
      annotationRefs: [],
      ...overrides,
    }),
  );
