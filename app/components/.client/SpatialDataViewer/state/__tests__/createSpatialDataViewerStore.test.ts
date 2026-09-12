import { describe, expect, test } from "vitest";

import {
  createSpatialDataViewerStore,
  DEFAULT_ELEMENT_OPACITY,
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

  test("attaches a working getStore closure to raster elements only", () => {
    const stores: Record<string, unknown> = {};
    // Minimal stand-in for a real ImageElement/LabelsElement: getStore() is the
    // memoized per-element store view the library hands out.
    const rasterInstance = (name: string, kind: string) => ({
      kind,
      key: name,
      getStore: () => stores[name] ?? (stores[name] = { view: name }),
    });
    const spatialData = {
      images: { z_image: rasterInstance("z_image", "images") },
      labels: { z_labels: rasterInstance("z_labels", "labels") },
      points: { pts: { kind: "points", key: "pts" } },
      shapes: { shp: { kind: "shapes", key: "shp" } },
      coordinateSystems: ["global"],
    } as never;

    const configs = elementsFromSpatialData(spatialData);
    const byId = Object.fromEntries(configs.map((c) => [`${c.elementType}:${c.elementKey}`, c]));

    const imageStore = byId["image:z_image"].getStore?.();
    const labelsStore = byId["labels:z_labels"].getStore?.();
    expect(imageStore).toEqual({ view: "z_image" });
    expect(labelsStore).toEqual({ view: "z_labels" });
    expect(byId["points:pts"].getStore).toBeUndefined();
    expect(byId["shapes:shp"].getStore).toBeUndefined();
  });

  test("the getStore closure defers to the element — no eager resolution at seed time", () => {
    let callCount = 0;
    const spatialData = {
      images: {
        z_image: {
          kind: "images",
          key: "z_image",
          getStore: () => {
            callCount += 1;
            return { view: callCount };
          },
        },
      },
      coordinateSystems: ["global"],
    } as never;

    const [config] = elementsFromSpatialData(spatialData);
    expect(callCount).toBe(0);
    // Every call routes through the element's own (memoized in production)
    // getStore — the closure adds no caching of its own.
    const first = config.getStore?.();
    const second = config.getStore?.();
    expect(first).toEqual({ view: 1 });
    expect(second).toEqual({ view: 2 });
    expect(callCount).toBe(2);
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

describe("setSpatialData re-seed", () => {
  const spatialData = () =>
    ({
      images: { z_image: { kind: "images", key: "z_image" } },
      coordinateSystems: ["global"],
    }) as never;

  test("carries zIndex and zSize across a re-seed of the same element key", () => {
    const store = createSpatialDataViewerStore();
    store.getState().setSpatialData(spatialData());
    store.getState().setElementZIndex("image:z_image", 2);
    store.getState().setElementZSize("image:z_image", 8);
    store.getState().setElementVisibility("image:z_image", false);

    store.getState().setSpatialData(spatialData());

    const config = store.getState().elements["image:z_image"];
    expect(config.zIndex).toBe(2);
    expect(config.zSize).toBe(8);
    // A re-seed is fresh data: user display state resets, z state persists.
    expect(config.isVisible).toBe(true);
    expect(config.opacity).toBe(DEFAULT_ELEMENT_OPACITY);
  });

  test("drops z state for elements absent from the re-seeded data", () => {
    const store = createSpatialDataViewerStore();
    store.getState().setSpatialData(spatialData());
    store.getState().setElementZSize("image:z_image", 8);

    store.getState().setSpatialData({
      images: { other_image: { kind: "images", key: "other_image" } },
      coordinateSystems: ["global"],
    } as never);

    expect(store.getState().elements["image:z_image"]).toBeUndefined();
    expect(store.getState().elements["image:other_image"].zSize).toBeUndefined();
  });
});
