import { describe, expect, it } from "vitest";

import { createViewerStore } from "../createViewerStore";
import {
  classColor,
  generateAnnotationName,
  selectSetFeatures,
  selectSetHiddenClasses,
} from "../slices/viewer.annotations.store";
import type { AnnotationFeature, AnnotationSet } from "~/utils/db/getAnnotationsWasm";

// Helpers ----------------------------------------------------------------

let featureSeq = 0;
const makeFeature = (overrides?: {
  id?: string;
  className?: string;
  color?: [number, number, number];
}): AnnotationFeature => ({
  type: "Feature",
  id: overrides?.id ?? `feat-${++featureSeq}`,
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: {
    ...(overrides?.className !== undefined
      ? { classification: { name: overrides.className, color: overrides?.color ?? [255, 0, 0] } }
      : {}),
  },
});

const makeSet = (
  id: string,
  createdBy: string,
  features: AnnotationFeature[] = [],
): AnnotationSet => ({ id, createdBy, features });

// -----------------------------------------------------------------------
// seedAnnotations
// -----------------------------------------------------------------------

describe("seedAnnotations", () => {
  it("installs a supplied set that was not present before", () => {
    const store = createViewerStore("seed-1");
    const features = [makeFeature({ id: "f1" })];

    store.getState().seedAnnotations([makeSet("set-a", "user-a", features)]);

    expect(store.getState().annotationSets.find((s) => s.id === "set-a")?.features).toBe(features);
  });

  it("does not mark any entry dirty (annotationView stays empty)", () => {
    const store = createViewerStore("seed-2");

    store.getState().seedAnnotations([makeSet("set-a", "user-a", [makeFeature()])]);

    // annotationView must remain untouched — seeding must never be treated
    // as a user edit that triggers an autosave write-back
    expect(store.getState().annotationView).toEqual({});
  });

  it("merges: adds absent sets while preserving sets already present", () => {
    const store = createViewerStore("seed-3");
    const existing = [makeFeature({ id: "keep" })];
    store.getState().seedAnnotations([makeSet("set-a", "user-a", existing)]);

    store
      .getState()
      .seedAnnotations([
        makeSet("set-a", "user-a", [makeFeature({ id: "from-s3" })]),
        makeSet("set-b", "user-b", [makeFeature({ id: "b1" })]),
      ]);

    // set-a was already present (user-touched) → in-memory version wins
    expect(store.getState().annotationSets.find((s) => s.id === "set-a")?.features).toBe(existing);
    // set-b was absent → the seeded set is installed
    expect(store.getState().annotationSets.find((s) => s.id === "set-b")?.features[0]?.id).toBe(
      "b1",
    );
  });

  it("regression (C-313): a pre-seed draw survives a seed that also targets that set", () => {
    const store = createViewerStore("seed-4", "user-a");
    // Simulate the user drawing a region before the async S3 read resolves.
    const drawn = [makeFeature({ id: "just-drawn" })];
    const setId = store.getState().ensureOwnSet();
    store.getState().updateSetFeatures(setId, drawn);

    // The one-time read resolves with a different (older) version of the same set.
    store
      .getState()
      .seedAnnotations([makeSet(setId, "user-a", [makeFeature({ id: "stale-from-s3" })])]);

    // The user's in-memory version must be kept, not clobbered by the seed.
    expect(store.getState().annotationSets.find((s) => s.id === setId)?.features).toBe(drawn);
    expect(store.getState().annotationSets.find((s) => s.id === setId)?.features[0]?.id).toBe(
      "just-drawn",
    );
  });
});

// -----------------------------------------------------------------------
// updateSetFeatures
// -----------------------------------------------------------------------

describe("updateSetFeatures", () => {
  it("sets the features array for the given set", () => {
    const store = createViewerStore("uuf-1");
    const features = [makeFeature({ id: "f1" })];
    store.getState().seedAnnotations([makeSet("set-a", "user-a")]);

    store.getState().updateSetFeatures("set-a", features);

    expect(store.getState().annotationSets.find((s) => s.id === "set-a")?.features).toEqual(
      features,
    );
  });

  it("produces a fresh array ref for the updated set (immer identity)", () => {
    const store = createViewerStore("uuf-2");
    const initial = [makeFeature({ id: "f1" })];
    store.getState().seedAnnotations([makeSet("set-a", "user-a", initial)]);
    const refBefore = store.getState().annotationSets.find((s) => s.id === "set-a")?.features;

    const updated = [makeFeature({ id: "f2" })];
    store.getState().updateSetFeatures("set-a", updated);

    expect(store.getState().annotationSets.find((s) => s.id === "set-a")?.features).not.toBe(
      refBefore,
    );
  });

  it("only touches the targeted set's features", () => {
    const store = createViewerStore("uuf-3");
    const userBFeatures = [makeFeature({ id: "b1" })];
    store
      .getState()
      .seedAnnotations([makeSet("set-b", "user-b", userBFeatures), makeSet("set-a", "user-a")]);

    store.getState().updateSetFeatures("set-a", [makeFeature({ id: "a1" })]);

    // set-b's array must be the same reference (immer did not copy it)
    expect(store.getState().annotationSets.find((s) => s.id === "set-b")?.features).toBe(
      userBFeatures,
    );
  });
});

// -----------------------------------------------------------------------
// setAnnotationClassColor
// -----------------------------------------------------------------------

describe("setAnnotationClassColor", () => {
  it("recolors all features of the named class for that set", () => {
    const store = createViewerStore("sacc-1");
    store
      .getState()
      .seedAnnotations([
        makeSet("set-a", "user-a", [
          makeFeature({ className: "Tumor", color: [255, 0, 0] }),
          makeFeature({ className: "Tumor", color: [255, 0, 0] }),
        ]),
      ]);

    store.getState().setAnnotationClassColor("set-a", "Tumor", [0, 255, 0]);

    const features = store.getState().annotationSets.find((s) => s.id === "set-a")!.features;
    expect(features[0].properties!.classification!.color).toEqual([0, 255, 0]);
    expect(features[1].properties!.classification!.color).toEqual([0, 255, 0]);
  });

  it("leaves features of other classes untouched", () => {
    const store = createViewerStore("sacc-2");
    store
      .getState()
      .seedAnnotations([
        makeSet("set-a", "user-a", [
          makeFeature({ className: "Tumor", color: [255, 0, 0] }),
          makeFeature({ className: "Stroma", color: [0, 0, 255] }),
        ]),
      ]);

    store.getState().setAnnotationClassColor("set-a", "Tumor", [0, 255, 0]);

    const features = store.getState().annotationSets.find((s) => s.id === "set-a")!.features;
    expect(features[1].properties!.classification!.color).toEqual([0, 0, 255]);
  });

  it("does nothing when set has no features", () => {
    const store = createViewerStore("sacc-3");

    // Must not throw when the set id is absent
    expect(() => {
      store.getState().setAnnotationClassColor("set-missing", "Tumor", [0, 255, 0]);
    }).not.toThrow();
  });
});

// -----------------------------------------------------------------------
// toggleAnnotationClassVisibility — per-set isolation (this fixed a real bug)
// -----------------------------------------------------------------------

describe("toggleAnnotationClassVisibility", () => {
  it("hides a class on first toggle", () => {
    const store = createViewerStore("tacv-1");

    store.getState().toggleAnnotationClassVisibility("set-a", "Tumor");

    expect(store.getState().annotationView["set-a"]?.hiddenClasses).toContain("Tumor");
  });

  it("un-hides a class on second toggle", () => {
    const store = createViewerStore("tacv-2");

    store.getState().toggleAnnotationClassVisibility("set-a", "Tumor");
    store.getState().toggleAnnotationClassVisibility("set-a", "Tumor");

    expect(store.getState().annotationView["set-a"]?.hiddenClasses).not.toContain("Tumor");
  });

  it("two sets' hidden class lists are independent", () => {
    const store = createViewerStore("tacv-3");

    store.getState().toggleAnnotationClassVisibility("set-a", "Tumor");
    // set-b has NOT toggled anything

    expect(store.getState().annotationView["set-a"]?.hiddenClasses).toContain("Tumor");
    expect(store.getState().annotationView["set-b"]?.hiddenClasses ?? []).not.toContain("Tumor");
  });

  it("toggling for set-b does not affect set-a", () => {
    const store = createViewerStore("tacv-4");
    store.getState().toggleAnnotationClassVisibility("set-a", "Tumor");

    store.getState().toggleAnnotationClassVisibility("set-b", "Tumor");

    // set-a's state must be unaffected
    expect(store.getState().annotationView["set-a"]?.hiddenClasses).toContain("Tumor");
  });
});

// -----------------------------------------------------------------------
// setAnnotationsOpacity — section-level (whole layer)
// -----------------------------------------------------------------------

describe("setAnnotationsOpacity", () => {
  it("defaults to 1", () => {
    const store = createViewerStore("sao-0");
    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [
        {
          id: "test-id",
          shared: false,
          author: "",
          channels: {},
          overlays: {},
          channelsOpacity: 1,
          overlaysFillOpacity: 0.8,
          showCellOutline: true,
          annotationsOpacity: 1,
          showAnnotationOutline: true,
          isChannelsLoading: 0,
          isOverlaysLoading: 0,
        },
      ],
    });

    expect(store.getState().layersStates[0].annotationsOpacity).toBe(1);
  });

  it("sets the whole-layer opacity", () => {
    const store = createViewerStore("sao-1");
    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [
        {
          id: "test-id",
          shared: false,
          author: "",
          channels: {},
          overlays: {},
          channelsOpacity: 1,
          overlaysFillOpacity: 0.8,
          showCellOutline: true,
          annotationsOpacity: 1,
          showAnnotationOutline: true,
          isChannelsLoading: 0,
          isOverlaysLoading: 0,
        },
      ],
    });

    store.getState().setAnnotationsOpacity(0.5);

    expect(store.getState().layersStates[0].annotationsOpacity).toBe(0.5);
  });
});

// -----------------------------------------------------------------------
// Selectors
// -----------------------------------------------------------------------

describe("selectSetFeatures", () => {
  it("returns the features array for a known set", () => {
    const store = createViewerStore("suf-1");
    const features = [makeFeature({ id: "f1" })];
    store.getState().seedAnnotations([makeSet("set-a", "user-a", features)]);

    const result = selectSetFeatures("set-a")(store.getState());

    expect(result).toBe(features);
  });

  it("returns a stable empty array for an unknown set", () => {
    const store = createViewerStore("suf-2");

    const first = selectSetFeatures("absent")(store.getState());
    const second = selectSetFeatures("absent")(store.getState());

    expect(first).toEqual([]);
    // Same reference across calls — prevents zustand render loops
    expect(first).toBe(second);
  });

  it("returns the stable empty array when setId is undefined", () => {
    const store = createViewerStore("suf-3");

    const result = selectSetFeatures(undefined)(store.getState());

    expect(result).toEqual([]);
  });
});

describe("selectSetHiddenClasses", () => {
  it("returns a stable empty array when no classes are hidden", () => {
    const store = createViewerStore("suhc-1");

    const first = selectSetHiddenClasses("absent")(store.getState());
    const second = selectSetHiddenClasses("absent")(store.getState());

    expect(first).toEqual([]);
    // Same reference — prevents zustand render loops
    expect(first).toBe(second);
  });

  it("returns the hidden classes once toggled", () => {
    const store = createViewerStore("suhc-2");
    store.getState().toggleAnnotationClassVisibility("set-a", "Tumor");

    expect(selectSetHiddenClasses("set-a")(store.getState())).toContain("Tumor");
  });

  it("returns a stable empty array when setId is undefined", () => {
    const store = createViewerStore("suhc-3");

    const first = selectSetHiddenClasses(undefined)(store.getState());
    const second = selectSetHiddenClasses(undefined)(store.getState());

    expect(first).toEqual([]);
    expect(first).toBe(second);
  });
});

// -----------------------------------------------------------------------
// generateAnnotationName
// -----------------------------------------------------------------------

describe("generateAnnotationName", () => {
  it("returns '0001' when no features exist", () => {
    expect(generateAnnotationName([])).toBe("0001");
  });

  it("returns '0002' when '0001' is taken", () => {
    const features = [makeFeature({ id: "f1" })];
    features[0].properties.name = "0001";
    expect(generateAnnotationName(features)).toBe("0002");
  });

  it("fills the first gap when a name is missing in the sequence", () => {
    const features = [makeFeature({ id: "f1" }), makeFeature({ id: "f3" })];
    features[0].properties.name = "0001";
    features[1].properties.name = "0003";
    expect(generateAnnotationName(features)).toBe("0002");
  });

  it("ignores empty-string names", () => {
    const features = [makeFeature({ id: "f1" })];
    features[0].properties.name = "";
    expect(generateAnnotationName(features)).toBe("0001");
  });
});

// -----------------------------------------------------------------------
// renameAnnotation
// -----------------------------------------------------------------------

describe("renameAnnotation", () => {
  it("sets properties.name on the target feature", () => {
    const store = createViewerStore("rename-1");
    const features = [makeFeature({ id: "f1" })];
    store.getState().seedAnnotations([makeSet("set-a", "user-a", features)]);

    store.getState().renameAnnotation("set-a", "f1", "My Region");

    expect(
      store.getState().annotationSets.find((s) => s.id === "set-a")!.features[0].properties.name,
    ).toBe("My Region");
  });

  it("trims whitespace from the name", () => {
    const store = createViewerStore("rename-2");
    store.getState().seedAnnotations([makeSet("set-a", "user-a", [makeFeature({ id: "f1" })])]);

    store.getState().renameAnnotation("set-a", "f1", "  Spaced  ");

    expect(
      store.getState().annotationSets.find((s) => s.id === "set-a")!.features[0].properties.name,
    ).toBe("Spaced");
  });

  it("clears the name when given an empty/whitespace string", () => {
    const store = createViewerStore("rename-3");
    store.getState().seedAnnotations([makeSet("set-a", "user-a", [makeFeature({ id: "f1" })])]);
    store.getState().renameAnnotation("set-a", "f1", "First");
    expect(
      store.getState().annotationSets.find((s) => s.id === "set-a")!.features[0].properties.name,
    ).toBe("First");

    store.getState().renameAnnotation("set-a", "f1", "   ");

    expect(
      store.getState().annotationSets.find((s) => s.id === "set-a")!.features[0].properties.name,
    ).toBeUndefined();
  });

  it("is a no-op when the feature id does not exist", () => {
    const store = createViewerStore("rename-4");
    store.getState().seedAnnotations([makeSet("set-a", "user-a", [makeFeature({ id: "f1" })])]);

    store.getState().renameAnnotation("set-a", "nonexistent", "Ghost");

    expect(
      store.getState().annotationSets.find((s) => s.id === "set-a")!.features[0].properties.name,
    ).toBeUndefined();
  });
});

// -----------------------------------------------------------------------
// classColor
// -----------------------------------------------------------------------

describe("classColor", () => {
  it("resolves a registered class with zero member features (C-328)", () => {
    expect(classColor([{ name: "Tumor", color: [1, 2, 3] }], [], "Tumor")).toEqual([1, 2, 3]);
  });

  it("falls back to a member feature's color for an unregistered name", () => {
    const member = makeFeature({ className: "Legacy", color: [4, 5, 6] });

    expect(classColor([], [member], "Legacy")).toEqual([4, 5, 6]);
  });

  it("prefers the registry over a member feature when both know the name", () => {
    const member = makeFeature({ className: "Tumor", color: [4, 5, 6] });

    expect(classColor([{ name: "Tumor", color: [1, 2, 3] }], [member], "Tumor")).toEqual([1, 2, 3]);
  });

  it("returns undefined when neither registry nor features know the name", () => {
    expect(classColor([], [makeFeature({ className: "Other" })], "Tumor")).toBeUndefined();
  });
});

// deleteAnnotationSet — C-456: removes the set, its view state, reassigns the
// active set, and drops selection entries pointing at the deleted features.
describe("deleteAnnotationSet", () => {
  it("removes the set and clears its view state", () => {
    const store = createViewerStore("del-1");
    store
      .getState()
      .seedAnnotations([
        makeSet("set-a", "user-a", [makeFeature()]),
        makeSet("set-b", "user-b", [makeFeature()]),
      ]);

    store.getState().deleteAnnotationSet("set-a");

    expect(store.getState().annotationSets.map((s) => s.id)).toEqual(["set-b"]);
    expect(store.getState().annotationView["set-a"]).toBeUndefined();
  });

  it("reassigns activeSetId when the active set is deleted", () => {
    const store = createViewerStore("del-2");
    store
      .getState()
      .seedAnnotations([makeSet("set-a", "user-a", []), makeSet("set-b", "user-b", [])]);
    // seedAnnotations makes the first seeded set active.
    expect(store.getState().activeSetId).toBe("set-a");

    store.getState().deleteAnnotationSet("set-a");

    expect(store.getState().activeSetId).toBe("set-b");
  });

  it("clears activeSetId when the last set is deleted, and filters the selection", () => {
    const store = createViewerStore("del-3");
    const survivor = makeFeature({ id: "survivor" });
    const doomed = makeFeature({ id: "doomed" });
    store
      .getState()
      .seedAnnotations([
        makeSet("set-a", "user-a", [doomed]),
        makeSet("set-b", "user-b", [survivor]),
      ]);
    expect(store.getState().activeSetId).toBe("set-a"); // first seeded set
    store.getState().setAnnotationSelectedIds(["doomed", "survivor"]);

    store.getState().deleteAnnotationSet("set-a");

    expect(store.getState().annotationSets.map((s) => s.id)).toEqual(["set-b"]);
    expect(store.getState().activeSetId).toBe("set-b");
    // The surviving set's feature stays selected; the deleted one is dropped.
    expect(store.getState().annotationSelectedIds).toEqual(["survivor"]);
  });

  it("is a no-op for an unknown set id", () => {
    const store = createViewerStore("del-4");
    store.getState().seedAnnotations([makeSet("set-a", "user-a", [makeFeature()])]);

    store.getState().deleteAnnotationSet("nope");

    expect(store.getState().annotationSets).toHaveLength(1);
  });
});
