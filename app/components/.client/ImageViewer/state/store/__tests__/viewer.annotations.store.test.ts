import { describe, expect, it } from "vitest";

import { createViewerStore } from "../createViewerStore";
import {
  selectUserFeatures,
  selectUserHiddenClasses,
  selectUserOpacity,
} from "../slices/viewer.annotations.store";
import type { AnnotationFeature, AnnotationsByUser } from "~/utils/db/getAnnotationsWasm";

// Helpers ----------------------------------------------------------------

const makeFeature = (overrides?: {
  id?: string;
  className?: string;
  color?: [number, number, number];
}): AnnotationFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: {
    ...(overrides?.id !== undefined ? { id: overrides.id } : {}),
    ...(overrides?.className !== undefined
      ? { classification: { name: overrides.className, color: overrides?.color ?? [255, 0, 0] } }
      : {}),
  },
});

// -----------------------------------------------------------------------
// seedAnnotations
// -----------------------------------------------------------------------

describe("seedAnnotations", () => {
  it("replaces annotationsByUser with the supplied map", () => {
    const store = createViewerStore("seed-1");
    const byUser: AnnotationsByUser = { "user-a": [makeFeature({ id: "f1" })] };

    store.getState().seedAnnotations(byUser);

    expect(store.getState().annotationsByUser).toBe(byUser);
  });

  it("does not mark any entry dirty (annotationView stays empty)", () => {
    const store = createViewerStore("seed-2");
    const byUser: AnnotationsByUser = { "user-a": [makeFeature()] };

    store.getState().seedAnnotations(byUser);

    // annotationView must remain untouched — seeding must never be treated
    // as a user edit that triggers an autosave write-back
    expect(store.getState().annotationView).toEqual({});
  });

  it("replaces a previously seeded map entirely", () => {
    const store = createViewerStore("seed-3");
    const first: AnnotationsByUser = { "user-a": [makeFeature()] };
    const second: AnnotationsByUser = { "user-b": [makeFeature()] };

    store.getState().seedAnnotations(first);
    store.getState().seedAnnotations(second);

    expect(store.getState().annotationsByUser).toBe(second);
    expect(store.getState().annotationsByUser["user-a"]).toBeUndefined();
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
// setAnnotationOpacity — including lazy init
// -----------------------------------------------------------------------

describe("setAnnotationOpacity", () => {
  it("sets the opacity for a new user, creating the view entry", () => {
    const store = createViewerStore("sao-1");

    store.getState().setAnnotationOpacity("user-a", 0.5);

    expect(store.getState().annotationView["user-a"]?.opacity).toBe(0.5);
  });

  it("lazy-initialises hiddenClasses to empty when creating the entry", () => {
    const store = createViewerStore("sao-2");

    store.getState().setAnnotationOpacity("user-a", 0.7);

    expect(store.getState().annotationView["user-a"]?.hiddenClasses).toEqual([]);
  });

  it("updates opacity without touching hiddenClasses when entry already exists", () => {
    const store = createViewerStore("sao-3");
    store.getState().toggleAnnotationClassVisibility("user-a", "Tumor");

    store.getState().setAnnotationOpacity("user-a", 0.3);

    expect(store.getState().annotationView["user-a"]?.opacity).toBe(0.3);
    expect(store.getState().annotationView["user-a"]?.hiddenClasses).toContain("Tumor");
  });

  it("only affects the targeted user's opacity", () => {
    const store = createViewerStore("sao-4");
    store.getState().setAnnotationOpacity("user-a", 0.5);
    store.getState().setAnnotationOpacity("user-b", 0.9);

    store.getState().setAnnotationOpacity("user-a", 0.2);

    expect(store.getState().annotationView["user-b"]?.opacity).toBe(0.9);
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

describe("selectUserOpacity", () => {
  it("defaults to 1 when no view entry exists", () => {
    const store = createViewerStore("suo-1");

    expect(selectUserOpacity("absent")(store.getState())).toBe(1);
  });

  it("returns the stored opacity once set", () => {
    const store = createViewerStore("suo-2");
    store.getState().setAnnotationOpacity("user-a", 0.4);

    expect(selectUserOpacity("user-a")(store.getState())).toBe(0.4);
  });

  it("defaults to 1 when userId is undefined", () => {
    const store = createViewerStore("suo-3");

    expect(selectUserOpacity(undefined)(store.getState())).toBe(1);
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
