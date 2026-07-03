import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useStore } from "zustand";

import { createViewerStore } from "../../../state/store/createViewerStore";
import type { ViewerStore } from "../../../state/store/types";
import { AnnotationsPanel } from "../AnnotationsPanel";
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
// tests focused on the AnnotationsPanel layout logic.
vi.mock("../AnnotationsTools", () => ({
  AnnotationsTools: () => <div data-testid="annotations-tools" />,
}));

// AnnotationsList has its own tests; stub it here to isolate layout behaviour.
vi.mock("../AnnotationsList", () => ({
  AnnotationsList: ({ userId, editable }: { userId: string; editable: boolean }) => (
    <div data-testid={`annotations-list-${userId}`} data-editable={String(editable)} />
  ),
}));

// NodeLink needs a router (NavLink); stub it to the node label to keep these
// tests focused on the controller's block layout.
vi.mock("~/components/DirectoryView/NodeLink/NodeLink", () => ({
  NodeLink: ({ node }: { node: { name: string } }) => (
    <div data-testid={`node-link-${node.name}`}>{node.name}</div>
  ),
}));

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

const makeFeature = (id: string): AnnotationFeature => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: [0, 0] },
  properties: {},
});

function buildStore() {
  // A valid resourceId (connectionName/pathName) — the controller derives each
  // user's sidecar TreeNode from the image's resourceId.
  const store = createViewerStore(`test-conn/images/slide-${Math.random()}.ome.tif`);
  currentStore = store;
  return store;
}

function renderController() {
  return render(<AnnotationsPanel />);
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

describe("AnnotationsPanel — own-first ordering", () => {
  test("own user's file block appears before peer blocks", () => {
    const store = buildStore();
    store.getState().updateUserFeatures("own-user", [makeFeature("f1")]);
    store.getState().updateUserFeatures("peer-a", [makeFeature("f2")]);
    store.getState().updateUserFeatures("peer-b", [makeFeature("f3")]);

    renderController();
    openAll();

    const blocks = screen.getAllByTestId(/^node-link-/);
    expect(blocks[0]).toHaveTextContent("You");
  });

  test("own file block is labeled 'You'", () => {
    const store = buildStore();
    store.getState().updateUserFeatures("own-user", [makeFeature("f1")]);

    renderController();
    openAll();

    expect(screen.getByTestId("node-link-You")).toBeInTheDocument();
  });

  test("peer file block shows a truncated user id", () => {
    const store = buildStore();
    store.getState().updateUserFeatures("peer-xyz", [makeFeature("f1")]);

    renderController();
    openAll();

    // peer-xyz → first 6 chars "peer-x"
    expect(screen.getByTestId("node-link-peer-x")).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------
// Empty own section injection
// -----------------------------------------------------------------------

describe("AnnotationsPanel — empty own block", () => {
  test("renders an own file block even when the user has no annotations yet", () => {
    buildStore(); // empty store — own user has no key

    renderController();
    openAll();

    expect(screen.getByTestId("node-link-You")).toBeInTheDocument();
  });

  test("empty own block does not appear when ownUserId is unknown", () => {
    currentUserId = undefined;
    buildStore();

    renderController();
    openAll();

    expect(screen.queryByTestId("node-link-You")).not.toBeInTheDocument();

    // Restore for subsequent tests.
    currentUserId = "own-user";
  });
});

// -----------------------------------------------------------------------
// Editable gating — own vs peers
// -----------------------------------------------------------------------

describe("AnnotationsPanel — editable gating", () => {
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

  test("draw tools appear once, in the single section header", () => {
    const store = buildStore();
    store.getState().updateUserFeatures("own-user", [makeFeature("f1")]);
    store.getState().updateUserFeatures("peer-a", [makeFeature("f2")]);

    renderController();
    openAll();

    // AnnotationsTools lives in the one Annotations section header, not per file block.
    expect(screen.getAllByTestId("annotations-tools")).toHaveLength(1);
  });
});
