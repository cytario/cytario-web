import { describe, expect, it } from "vitest";

import { createViewerStore } from "../createViewerStore";
import {
  classColor,
  selectUserFeatures,
  selectUserHiddenClasses,
} from "../slices/viewer.annotations.store";
import type { AnnotationFeature, AnnotationsByUser } from "~/utils/db/getAnnotationsWasm";

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

// -----------------------------------------------------------------------
// seedAnnotations
// -----------------------------------------------------------------------

describe("seedAnnotations", () => {
  it("installs a supplied key that was not present before", () => {
    const store = createViewerStore("seed-1");
    const features = [makeFeature({ id: "f1" })];

    store.getState().seedAnnotations({ "user-a": features });

    expect(store.getState().annotationsByUser["user-a"]).toBe(features);
  });

  it("does not mark any entry dirty (annotationView stays empty)", () => {
    const store = createViewerStore("seed-2");
    const byUser: AnnotationsByUser = { "user-a": [makeFeature()] };

    store.getState().seedAnnotations(byUser);

    // annotationView must remain untouched — seeding must never be treated
    // as a user edit that triggers an autosave write-back
    expect(store.getState().annotationView).toEqual({});
  });

  it("merges: adds absent keys while preserving keys already present", () => {
    const store = createViewerStore("seed-3");
    const existing = [makeFeature({ id: "keep" })];
    store.getState().updateUserFeatures("user-a", existing);

    store.getState().seedAnnotations({
      "user-a": [makeFeature({ id: "from-s3" })],
      "user-b": [makeFeature({ id: "b1" })],
    });

    // user-a was already present (user-touched) → in-memory version wins
    expect(store.getState().annotationsByUser["user-a"]).toBe(existing);
    // user-b was absent → the seeded set is installed
    expect(store.getState().annotationsByUser["user-b"]![0].id).toBe("b1");
  });

  it("regression (C-313): a pre-seed draw survives a seed that also targets that key", () => {
    const store = createViewerStore("seed-4");
    // Simulate the user drawing a region before the async S3 read resolves.
    const drawn = [makeFeature({ id: "just-drawn" })];
    store.getState().updateUserFeatures("user-a", drawn);

    // The one-time read resolves with a different (older) version of the same key.
    store.getState().seedAnnotations({ "user-a": [makeFeature({ id: "stale-from-s3" })] });

    // The user's in-memory version must be kept, not clobbered by the seed.
    expect(store.getState().annotationsByUser["user-a"]).toBe(drawn);
    expect(store.getState().annotationsByUser["user-a"]![0].id).toBe("just-drawn");
  });
});

// -----------------------------------------------------------------------
// updateUserFeatures
// -----------------------------------------------------------------------

describe("updateUserFeatures", () => {
  it("sets the features array for the given user", () => {
    const store = createViewerStore("uuf-1");
    const features = [makeFeature({ id: "f1" })];

    store.getState().updateUserFeatures("user-a", features);

    expect(store.getState().annotationsByUser["user-a"]).toEqual(features);
  });

  it("produces a fresh array ref for the updated user (immer identity)", () => {
    const store = createViewerStore("uuf-2");
    const initial = [makeFeature({ id: "f1" })];
    store.getState().updateUserFeatures("user-a", initial);
    const refBefore = store.getState().annotationsByUser["user-a"];

    const updated = [makeFeature({ id: "f2" })];
    store.getState().updateUserFeatures("user-a", updated);

    expect(store.getState().annotationsByUser["user-a"]).not.toBe(refBefore);
  });

  it("only touches the targeted user's key", () => {
    const store = createViewerStore("uuf-3");
    const userBFeatures = [makeFeature({ id: "b1" })];
    store.getState().updateUserFeatures("user-b", userBFeatures);

    store.getState().updateUserFeatures("user-a", [makeFeature({ id: "a1" })]);

    // user-b's array must be the same reference (immer did not copy it)
    expect(store.getState().annotationsByUser["user-b"]).toBe(userBFeatures);
  });
});

// -----------------------------------------------------------------------
// setAnnotationClassColor
// -----------------------------------------------------------------------

describe("setAnnotationClassColor", () => {
  it("recolors all features of the named class for that user", () => {
    const store = createViewerStore("sacc-1");
    store
      .getState()
      .updateUserFeatures("user-a", [
        makeFeature({ className: "Tumor", color: [255, 0, 0] }),
        makeFeature({ className: "Tumor", color: [255, 0, 0] }),
      ]);

    store.getState().setAnnotationClassColor("user-a", "Tumor", [0, 255, 0]);

    const features = store.getState().annotationsByUser["user-a"]!;
    expect(features[0].properties!.classification!.color).toEqual([0, 255, 0]);
    expect(features[1].properties!.classification!.color).toEqual([0, 255, 0]);
  });

  it("leaves features of other classes untouched", () => {
    const store = createViewerStore("sacc-2");
    store
      .getState()
      .updateUserFeatures("user-a", [
        makeFeature({ className: "Tumor", color: [255, 0, 0] }),
        makeFeature({ className: "Stroma", color: [0, 0, 255] }),
      ]);

    store.getState().setAnnotationClassColor("user-a", "Tumor", [0, 255, 0]);

    const features = store.getState().annotationsByUser["user-a"]!;
    expect(features[1].properties!.classification!.color).toEqual([0, 0, 255]);
  });

  it("does nothing when user has no features", () => {
    const store = createViewerStore("sacc-3");

    // Must not throw when the user key is absent
    expect(() => {
      store.getState().setAnnotationClassColor("user-missing", "Tumor", [0, 255, 0]);
    }).not.toThrow();
  });
});

// -----------------------------------------------------------------------
// toggleAnnotationClassVisibility — per-user isolation (this fixed a real bug)
// -----------------------------------------------------------------------

describe("toggleAnnotationClassVisibility", () => {
  it("hides a class on first toggle", () => {
    const store = createViewerStore("tacv-1");

    store.getState().toggleAnnotationClassVisibility("user-a", "Tumor");

    expect(store.getState().annotationView["user-a"]?.hiddenClasses).toContain("Tumor");
  });

  it("un-hides a class on second toggle", () => {
    const store = createViewerStore("tacv-2");

    store.getState().toggleAnnotationClassVisibility("user-a", "Tumor");
    store.getState().toggleAnnotationClassVisibility("user-a", "Tumor");

    expect(store.getState().annotationView["user-a"]?.hiddenClasses).not.toContain("Tumor");
  });

  it("two users' hidden class lists are independent", () => {
    const store = createViewerStore("tacv-3");

    store.getState().toggleAnnotationClassVisibility("user-a", "Tumor");
    // user-b has NOT toggled anything

    expect(store.getState().annotationView["user-a"]?.hiddenClasses).toContain("Tumor");
    expect(store.getState().annotationView["user-b"]?.hiddenClasses ?? []).not.toContain("Tumor");
  });

  it("toggling for user-b does not affect user-a", () => {
    const store = createViewerStore("tacv-4");
    store.getState().toggleAnnotationClassVisibility("user-a", "Tumor");

    store.getState().toggleAnnotationClassVisibility("user-b", "Tumor");

    // user-a's state must be unaffected
    expect(store.getState().annotationView["user-a"]?.hiddenClasses).toContain("Tumor");
  });
});

// -----------------------------------------------------------------------
// setAnnotationsOpacity — section-level (whole layer)
// -----------------------------------------------------------------------

describe("setAnnotationsOpacity", () => {
  it("defaults to 1", () => {
    const store = createViewerStore("sao-0");

    expect(store.getState().annotationsOpacity).toBe(1);
  });

  it("sets the whole-layer opacity", () => {
    const store = createViewerStore("sao-1");

    store.getState().setAnnotationsOpacity(0.5);

    expect(store.getState().annotationsOpacity).toBe(0.5);
  });
});

// -----------------------------------------------------------------------
// Selectors
// -----------------------------------------------------------------------

describe("selectUserFeatures", () => {
  it("returns the features array for a known user", () => {
    const store = createViewerStore("suf-1");
    const features = [makeFeature({ id: "f1" })];
    store.getState().updateUserFeatures("user-a", features);

    const result = selectUserFeatures("user-a")(store.getState());

    expect(result).toBe(features);
  });

  it("returns a stable empty array for an unknown user", () => {
    const store = createViewerStore("suf-2");

    const first = selectUserFeatures("absent")(store.getState());
    const second = selectUserFeatures("absent")(store.getState());

    expect(first).toEqual([]);
    // Same reference across calls — prevents zustand render loops
    expect(first).toBe(second);
  });

  it("returns the stable empty array when userId is undefined", () => {
    const store = createViewerStore("suf-3");

    const result = selectUserFeatures(undefined)(store.getState());

    expect(result).toEqual([]);
  });
});

describe("selectUserHiddenClasses", () => {
  it("returns a stable empty array when no classes are hidden", () => {
    const store = createViewerStore("suhc-1");

    const first = selectUserHiddenClasses("absent")(store.getState());
    const second = selectUserHiddenClasses("absent")(store.getState());

    expect(first).toEqual([]);
    // Same reference — prevents zustand render loops
    expect(first).toBe(second);
  });

  it("returns the hidden classes once toggled", () => {
    const store = createViewerStore("suhc-2");
    store.getState().toggleAnnotationClassVisibility("user-a", "Tumor");

    expect(selectUserHiddenClasses("user-a")(store.getState())).toContain("Tumor");
  });

  it("returns a stable empty array when userId is undefined", () => {
    const store = createViewerStore("suhc-3");

    const first = selectUserHiddenClasses(undefined)(store.getState());
    const second = selectUserHiddenClasses(undefined)(store.getState());

    expect(first).toEqual([]);
    expect(first).toBe(second);
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
