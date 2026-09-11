import { describe, expect, test } from "vitest";

import {
  createSpatialDataViewerStore,
  elementsFromSpatialData,
  type SpatialDataViewerState,
} from "../createSpatialDataViewerStore";

const seedState = (
  elements: SpatialDataViewerState["elements"],
): Pick<SpatialDataViewerState, "elements"> => ({ elements });

const element = (
  overrides: Partial<SpatialDataViewerState["elements"][string]> = {},
): SpatialDataViewerState["elements"][string] => ({
  elementType: "image",
  elementKey: "blobs_image",
  isVisible: true,
  opacity: 1,
  ...overrides,
});

describe("elementsFromSpatialData", () => {
  test("leaves zIndex and zSize undefined before the panel resolves them", () => {
    const elements = elementsFromSpatialData({
      images: { a: { kind: "images", key: "a" } },
      labels: { b: { kind: "labels", key: "b" } },
      points: { c: { kind: "points", key: "c" } },
      shapes: { d: { kind: "shapes", key: "d" } },
      coordinateSystems: ["global"],
    } as never);

    expect(elements).toHaveLength(4);
    for (const config of elements) {
      expect(config.zIndex).toBeUndefined();
      expect(config.zSize).toBeUndefined();
    }
  });
});

describe("setElementZIndex", () => {
  test("updates only the targeted element", () => {
    const store = createSpatialDataViewerStore();
    store.setState(
      seedState({
        "image:z_image": element({ elementKey: "z_image", zIndex: 0, zSize: 5 }),
        "image:flat_image": element({ elementKey: "flat_image" }),
      }),
    );

    store.getState().setElementZIndex("image:z_image", 3);

    const { elements } = store.getState();
    expect(elements["image:z_image"].zIndex).toBe(3);
    expect(elements["image:flat_image"].zIndex).toBeUndefined();
  });

  test("ignores unknown element ids", () => {
    const store = createSpatialDataViewerStore();
    store.setState(seedState({ "image:a": element({ elementKey: "a" }) }));

    store.getState().setElementZIndex("image:missing", 2);

    expect(store.getState().elements["image:a"].zIndex).toBeUndefined();
  });
});

describe("setElementZSize", () => {
  test("records the resolved plane count for the element", () => {
    const store = createSpatialDataViewerStore();
    store.setState(seedState({ "labels:a": element({ elementType: "labels", elementKey: "a" }) }));

    store.getState().setElementZSize("labels:a", 16);

    expect(store.getState().elements["labels:a"].zSize).toBe(16);
  });
});
