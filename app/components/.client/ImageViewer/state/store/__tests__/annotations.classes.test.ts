import { describe, expect, it } from "vitest";

import { LEGACY_CLASSES_KEY } from "../annotations/annotations.store";
import { createViewerStore } from "../createViewerStore";
import { seedViewerConnection } from "~/utils/__tests__/__mocks__";

let store: ReturnType<typeof createViewerStore>;

beforeEach(() => {
  seedViewerConnection("test-conn");
  store = createViewerStore(`test-conn/images/classes-${Math.random()}.ome.tif`, "me");
});

describe("per-set class registry scoping (C-635)", () => {
  it("creates a class only in the set whose action was used", () => {
    const setA = store.getState().ensureOwnSet();
    const setB = store.getState().createAnnotationSet();

    const name = store.getState().createAnnotationClass(setA, "Tumor");

    expect(name).toBe("Tumor");
    expect(store.getState().annotationClasses[setA]).toEqual([
      { name: "Tumor", color: expect.anything() },
    ]);
    expect(store.getState().annotationClasses[setB]).toBeUndefined();
  });

  it("keeps rename, recolor and delete scoped to their set", () => {
    const setA = store.getState().ensureOwnSet();
    const setB = store.getState().createAnnotationSet();
    const a = store.getState();
    const nameA = a.createAnnotationClass(setA, "Stroma");
    const nameB = a.createAnnotationClass(setB, "Stroma");

    store.getState().renameAnnotationClass(setA, nameA, "Tumor");
    expect(store.getState().annotationClasses[setA]?.[0]?.name).toBe("Tumor");
    expect(store.getState().annotationClasses[setB]?.[0]?.name).toBe(nameB);

    store.getState().setAnnotationClassColor(setA, "Tumor", [1, 2, 3]);
    expect(store.getState().annotationClasses[setA]?.[0]?.color).toEqual([1, 2, 3]);
    expect(store.getState().annotationClasses[setB]?.[0]?.color).not.toEqual([1, 2, 3]);

    store.getState().deleteAnnotationClass(setA, "Tumor");
    expect(store.getState().annotationClasses[setA]).toEqual([]);
    expect(store.getState().annotationClasses[setB]).toHaveLength(1);
  });

  it("drops a set's registry entry when the set is deleted", () => {
    const setA = store.getState().ensureOwnSet();
    store.getState().createAnnotationClass(setA, "Tumor");

    store.getState().deleteAnnotationSet(setA);

    expect(store.getState().annotationClasses[setA]).toBeUndefined();
  });

  it("uniquifies class names within a set only", () => {
    const setA = store.getState().ensureOwnSet();
    const setB = store.getState().createAnnotationSet();

    const first = store.getState().createAnnotationClass(setA, "Tumor");
    const inB = store.getState().createAnnotationClass(setB, "Tumor");

    expect(first).toBe("Tumor");
    expect(inB).toBe("Tumor");
    const secondInA = store.getState().createAnnotationClass(setA, "Tumor");
    expect(secondInA).toBe("Tumor 2");
  });

  it("adopts a legacy flat registry into the first annotation set on seed", () => {
    const setA = store.getState().ensureOwnSet();
    const setB = store.getState().createAnnotationSet();
    store.setState({
      annotationClasses: { [LEGACY_CLASSES_KEY]: [{ name: "Legacy", color: [9, 8, 7] }] },
    });

    store.getState().seedAnnotations([{ id: setA, createdBy: "me", features: [], name: "a.json" }]);

    expect(store.getState().annotationClasses[setA]).toEqual([
      { name: "Legacy", color: [9, 8, 7] },
    ]);
    expect(store.getState().annotationClasses[setB]).toBeUndefined();
    expect(store.getState().annotationClasses[LEGACY_CLASSES_KEY]).toBeUndefined();
  });
});
