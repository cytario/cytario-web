import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useStore } from "zustand";

import { createViewerStore } from "../../../state/store/createViewerStore";
import type { ViewerStore } from "../../../state/store/types";
import { AnnotationsController } from "../AnnotationsController";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

// Inject a real store instance without the image-loading side-effects.
let currentStore: ReturnType<typeof createViewerStore>;

vi.mock("../../../state/store/ViewerStoreContext", () => ({
  useViewerStore: <T,>(selector: (state: ViewerStore) => T): T => useStore(currentStore, selector),
}));

// Control the current user identity per test.
let currentUserId: string | undefined = "own-user";

vi.mock("~/hooks/useCurrentUser", () => ({
  useCurrentUser: () => (currentUserId ? { sub: currentUserId } : undefined),
}));

// AnnotationsTools renders draw-mode controls that pull from the store and
// have deep dependencies (canvas layer modes, etc.); stub it to keep these
// tests focused on the AnnotationsController layout logic.
vi.mock("../AnnotationsTools", () => ({
  AnnotationsTools: () => <div data-testid="annotations-tools" />,
}));

// AnnotationsList has its own tests; stub it here to isolate layout behaviour.
vi.mock("../AnnotationsList", () => ({
  AnnotationsList: ({ userId, editable }: { userId: string; editable: boolean }) => (
    <div data-testid={`annotations-list-${userId}`} data-editable={String(editable)} />
  ),
}));

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

const makeFeature = (id: string): AnnotationFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: { id },
});

function buildStore() {
  const store = createViewerStore(`test-${Math.random()}`);
  currentStore = store;
  return store;
}

function renderController() {
  return render(<AnnotationsController />);
}

/** Opens all FeatureItem accordions (click every [data-expander] button). */
function openAll() {
  for (const btn of screen.getAllByRole("button").filter((b) => b.getAttribute("data-expander"))) {
    fireEvent.click(btn);
  }
}

// -----------------------------------------------------------------------
// Own-first ordering
// -----------------------------------------------------------------------

describe("AnnotationsController — own-first ordering", () => {
  test("own user's section appears before peer sections", () => {
    const store = buildStore();
    store.getState().updateUserFeatures("own-user", [makeFeature("f1")]);
    store.getState().updateUserFeatures("peer-a", [makeFeature("f2")]);
    store.getState().updateUserFeatures("peer-b", [makeFeature("f3")]);

    renderController();

    const items = screen.getAllByText(/^Annotations/);
    expect(items[0]).toHaveTextContent("Annotations (You)");
  });

  test("own section is titled 'Annotations (You)'", () => {
    const store = buildStore();
    store.getState().updateUserFeatures("own-user", [makeFeature("f1")]);

    renderController();

    expect(screen.getByText("Annotations (You)")).toBeInTheDocument();
  });

  test("peer section title shows a truncated user id", () => {
    const store = buildStore();
    store.getState().updateUserFeatures("peer-xyz", [makeFeature("f1")]);

    renderController();

    // peer-xyz → first 6 chars "peer-x"
    expect(screen.getByText("Annotations (peer-x)")).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------
// Empty own section injection
// -----------------------------------------------------------------------

describe("AnnotationsController — empty own section", () => {
  test("renders an own section even when the user has no annotations yet", () => {
    buildStore(); // empty store — own user has no key

    renderController();

    expect(screen.getByText("Annotations (You)")).toBeInTheDocument();
  });

  test("empty own section does not appear when ownUserId is unknown", () => {
    currentUserId = undefined;
    buildStore();

    renderController();

    expect(screen.queryByText("Annotations (You)")).not.toBeInTheDocument();

    // Restore for subsequent tests.
    currentUserId = "own-user";
  });
});

// -----------------------------------------------------------------------
// Editable gating — own vs peers
// -----------------------------------------------------------------------

describe("AnnotationsController — editable gating", () => {
  test("own AnnotationsList is rendered with editable=true", () => {
    const store = buildStore();
    store.getState().updateUserFeatures("own-user", [makeFeature("f1")]);

    renderController();
    openAll();

    const ownList = screen.getByTestId("annotations-list-own-user");
    expect(ownList).toHaveAttribute("data-editable", "true");
  });

  test("peer AnnotationsList is rendered with editable=false", () => {
    const store = buildStore();
    store.getState().updateUserFeatures("peer-a", [makeFeature("f1")]);

    renderController();
    openAll();

    const peerList = screen.getByTestId("annotations-list-peer-a");
    expect(peerList).toHaveAttribute("data-editable", "false");
  });

  test("draw tools appear only in the own section header (not in peer sections)", () => {
    const store = buildStore();
    store.getState().updateUserFeatures("own-user", [makeFeature("f1")]);
    store.getState().updateUserFeatures("peer-a", [makeFeature("f2")]);

    renderController();
    openAll();

    // AnnotationsTools is only injected into the own FeatureItem header.
    expect(screen.getAllByTestId("annotations-tools")).toHaveLength(1);
  });
});
