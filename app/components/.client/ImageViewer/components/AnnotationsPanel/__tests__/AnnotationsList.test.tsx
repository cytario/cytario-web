import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useStore } from "zustand";

import { createViewerStore } from "../../../state/store/createViewerStore";
import type { ViewerStore } from "../../../state/store/types";
import { AnnotationsList } from "../AnnotationsList";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

// Mock the ViewerStoreContext so we can inject a real store without the
// image-loading / S3-sync side-effects of the full ViewerStoreProvider.
// Every test builds its own store instance via buildStore().
let currentStore: ReturnType<typeof createViewerStore>;

vi.mock("../../../state/store/ViewerStoreContext", () => ({
  useViewerStore: <T,>(selector: (state: ViewerStore) => T): T => useStore(currentStore, selector),
}));

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

const makeFeature = (
  id: string,
  className?: string,
  color?: [number, number, number],
): AnnotationFeature => ({
  type: "Feature",
  id,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0],
      ],
    ],
  },
  properties: {
    ...(className ? { classification: { name: className, color: color ?? [255, 0, 0] } } : {}),
  },
});

// Intentionally malformed (no top-level id) to exercise the component's
// defensive idless handling; validation drops these before render in practice.
const makeIdlessFeature = (): AnnotationFeature =>
  ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: {},
  }) as unknown as AnnotationFeature;

function buildStore(userId = "user-a", features: AnnotationFeature[] = []) {
  const store = createViewerStore(`test-${Math.random()}`);
  store.getState().updateUserFeatures(userId, features);
  currentStore = store;
  return store;
}

/** Renders AnnotationsList against the pre-configured currentStore. */
function renderList(
  features: AnnotationFeature[],
  { userId = "user-a", editable = true }: { userId?: string; editable?: boolean } = {},
) {
  buildStore(userId, features);
  return render(<AnnotationsList userId={userId} features={features} editable={editable} />);
}

/** Returns the thumbnail buttons in DOM order (grouped order = the Shift-range axis). */
function thumbButtons() {
  return screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));
}

/** Clicks the Nth thumbnail (0-based) with optional modifier keys. */
function clickThumb(
  index: number,
  modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean },
) {
  const buttons = thumbButtons();
  fireEvent.click(buttons[index]!, modifiers ?? {});
}

// -----------------------------------------------------------------------
// select() — C-319 multi-select logic
// -----------------------------------------------------------------------

describe("AnnotationsList — select() semantics (C-319)", () => {
  test("plain click selects only the clicked feature", () => {
    const features = [makeFeature("f1"), makeFeature("f2"), makeFeature("f3")];
    renderList(features);

    clickThumb(1);

    expect(currentStore.getState().annotationSelectedIds).toEqual(["f2"]);
  });

  test("plain click replaces a previous selection", () => {
    const features = [makeFeature("f1"), makeFeature("f2"), makeFeature("f3")];
    renderList(features);

    clickThumb(0);
    clickThumb(2);

    expect(currentStore.getState().annotationSelectedIds).toEqual(["f3"]);
  });

  test("Cmd+click adds an unselected feature to the selection", () => {
    const features = [makeFeature("f1"), makeFeature("f2"), makeFeature("f3")];
    renderList(features);

    clickThumb(0);
    clickThumb(2, { metaKey: true });

    expect(currentStore.getState().annotationSelectedIds).toEqual(["f1", "f3"]);
  });

  test("Cmd+click removes an already-selected feature (toggle out)", () => {
    const features = [makeFeature("f1"), makeFeature("f2"), makeFeature("f3")];
    renderList(features);

    // Select f1 and f2, then toggle f1 out.
    clickThumb(0);
    clickThumb(1, { metaKey: true });
    clickThumb(0, { metaKey: true });

    expect(currentStore.getState().annotationSelectedIds).toEqual(["f2"]);
  });

  test("Ctrl+click adds an unselected feature (same semantics as Cmd)", () => {
    const features = [makeFeature("f1"), makeFeature("f2"), makeFeature("f3")];
    renderList(features);

    clickThumb(0);
    clickThumb(2, { ctrlKey: true });

    expect(currentStore.getState().annotationSelectedIds).toEqual(["f1", "f3"]);
  });

  test("Shift+click selects the contiguous range from anchor to target (forward)", () => {
    const features = [
      makeFeature("f1"),
      makeFeature("f2"),
      makeFeature("f3"),
      makeFeature("f4"),
      makeFeature("f5"),
    ];
    renderList(features);

    // Anchor at index 1, then Shift+click index 4.
    clickThumb(1);
    clickThumb(4, { shiftKey: true });

    expect(currentStore.getState().annotationSelectedIds).toEqual(["f2", "f3", "f4", "f5"]);
  });

  test("Shift+click selects the contiguous range from anchor to target (backward)", () => {
    const features = [
      makeFeature("f1"),
      makeFeature("f2"),
      makeFeature("f3"),
      makeFeature("f4"),
      makeFeature("f5"),
    ];
    renderList(features);

    // Anchor at index 3, then Shift+click index 0.
    clickThumb(3);
    clickThumb(0, { shiftKey: true });

    expect(currentStore.getState().annotationSelectedIds).toEqual(["f1", "f2", "f3", "f4"]);
  });

  test("Shift+click with no prior anchor falls back to plain select", () => {
    const features = [makeFeature("f1"), makeFeature("f2"), makeFeature("f3")];
    renderList(features);

    // No prior click — Shift+click with no anchor should single-select.
    clickThumb(2, { shiftKey: true });

    expect(currentStore.getState().annotationSelectedIds).toEqual(["f3"]);
  });

  test("Cmd+click moves the anchor so subsequent Shift+click extends from the new anchor", () => {
    const features = [
      makeFeature("f1"),
      makeFeature("f2"),
      makeFeature("f3"),
      makeFeature("f4"),
      makeFeature("f5"),
    ];
    renderList(features);

    // Anchor at 0, then Cmd+click 2 (anchor moves to 2), then Shift+click 4.
    clickThumb(0);
    clickThumb(2, { metaKey: true });
    clickThumb(4, { shiftKey: true });

    // Range from anchor (f3) to f5.
    expect(currentStore.getState().annotationSelectedIds).toEqual(["f3", "f4", "f5"]);
  });

  test("clicking a feature with no id clears the selection", () => {
    const features = [makeFeature("f1"), makeFeature("f2"), makeIdlessFeature()];
    renderList(features);

    // Select f1 first.
    clickThumb(0);
    expect(currentStore.getState().annotationSelectedIds).toEqual(["f1"]);

    // Click the id-less feature — selection should clear.
    clickThumb(2);

    expect(currentStore.getState().annotationSelectedIds).toEqual([]);
  });

  test("Shift+click anchor stays fixed across multiple range extensions", () => {
    const features = [makeFeature("f1"), makeFeature("f2"), makeFeature("f3"), makeFeature("f4")];
    renderList(features);

    // Anchor at 0.
    clickThumb(0);
    // Extend to 3.
    clickThumb(3, { shiftKey: true });
    // Extend back to 1 (anchor still 0 — re-clicking Shift replaces the range).
    clickThumb(1, { shiftKey: true });

    expect(currentStore.getState().annotationSelectedIds).toEqual(["f1", "f2"]);
  });
});

// -----------------------------------------------------------------------
// aria-pressed reflects selection state
// -----------------------------------------------------------------------

describe("AnnotationsList — thumbnail selected state", () => {
  test("aria-pressed is false on all thumbnails initially", () => {
    const features = [makeFeature("f1"), makeFeature("f2")];
    renderList(features);

    for (const btn of thumbButtons()) {
      expect(btn).toHaveAttribute("aria-pressed", "false");
    }
  });

  test("aria-pressed turns true on the selected thumbnail after click", () => {
    const features = [makeFeature("f1"), makeFeature("f2")];
    renderList(features);

    clickThumb(0);

    expect(thumbButtons()[0]).toHaveAttribute("aria-pressed", "true");
    expect(thumbButtons()[1]).toHaveAttribute("aria-pressed", "false");
  });
});

// -----------------------------------------------------------------------
// delete
// -----------------------------------------------------------------------

describe("AnnotationsList — delete", () => {
  test("delete removes the feature from the user's set", () => {
    const f1 = makeFeature("f1");
    const f2 = makeFeature("f2");
    renderList([f1, f2]);

    // Open actions menu on the first thumb and delete.
    const actionButtons = screen.getAllByRole("button", { name: /^Actions for / });
    fireEvent.click(actionButtons[0]!);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete annotation" }));

    expect(currentStore.getState().annotationsByUser["user-a"]).toHaveLength(1);
    expect(currentStore.getState().annotationsByUser["user-a"]![0].id).toBe("f2");
  });

  test("delete clears the selection and anchor", () => {
    const features = [makeFeature("f1"), makeFeature("f2")];
    renderList(features);

    clickThumb(0);
    expect(currentStore.getState().annotationSelectedIds).toEqual(["f1"]);

    const actionButtons = screen.getAllByRole("button", { name: /^Actions for / });
    fireEvent.click(actionButtons[0]!);
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete annotation" }));

    expect(currentStore.getState().annotationSelectedIds).toEqual([]);
  });
});

// -----------------------------------------------------------------------
// Grouping
// -----------------------------------------------------------------------

describe("AnnotationsList — classification grouping", () => {
  test("features are grouped by classification name with a header per group", () => {
    const features = [
      makeFeature("f1", "Tumor"),
      makeFeature("f2", "Stroma"),
      makeFeature("f3", "Tumor"),
    ];
    renderList(features);

    expect(screen.getByText("Tumor")).toBeInTheDocument();
    expect(screen.getByText("Stroma")).toBeInTheDocument();
  });

  test("features without a classification appear under the Unclassified group", () => {
    const features = [makeFeature("f1")]; // no classification
    renderList(features);

    expect(screen.getByText("Unclassified")).toBeInTheDocument();
  });

  test("group count reflects the number of features in that group", () => {
    const features = [
      makeFeature("f1", "Tumor"),
      makeFeature("f2", "Tumor"),
      makeFeature("f3", "Stroma"),
    ];
    renderList(features);

    // The Tumor group count is 2, Stroma is 1.
    // AnnotationGroupRow renders the count as a plain number text.
    const counts = screen.getAllByText(/^\d+$/);
    const countValues = counts.map((el) => el.textContent);
    expect(countValues).toContain("2");
    expect(countValues).toContain("1");
  });

  test("Delete is disabled on peer (non-editable) thumbnails", () => {
    const features = [makeFeature("f1")];
    renderList(features, { editable: false });

    fireEvent.click(screen.getByRole("button", { name: /^Actions for / }));

    expect(screen.getByRole("menuitem", { name: "Delete annotation" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
