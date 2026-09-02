import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useStore } from "zustand";

import { createViewerStore } from "../../../../state/store/createViewerStore";
import type { ViewerStore } from "../../../../state/store/types";
import { AnnotationsControl } from "../AnnotationsControl";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

// Inject a real store instance without the image-loading side-effects.
let currentStore: ReturnType<typeof createViewerStore>;

vi.mock("../../../../state/store/ViewerStoreContext", () => ({
  useViewerStore: <T,>(selector: (state: ViewerStore) => T): T => useStore(currentStore, selector),
}));

// Control the current user identity per test.
let currentUserId: string | undefined = "own-user";

vi.mock("~/hooks/useCurrentUser", () => ({
  useCurrentUser: () => (currentUserId ? { sub: currentUserId } : undefined),
}));

// AnnotationsList has its own tests; stub it here to isolate layout behaviour.
vi.mock("../AnnotationsList", () => ({
  AnnotationsList: ({
    setId,
    editable,
    searchQuery,
  }: {
    setId: string;
    editable: boolean;
    searchQuery: string;
  }) => (
    <div
      data-testid={`annotations-list-${setId}`}
      data-editable={String(editable)}
      data-search={searchQuery}
    />
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
  // set's sidecar TreeNode from the image's resourceId.
  const store = createViewerStore(
    `test-conn/images/slide-${Math.random()}.ome.tif`,
    currentUserId ?? "",
  );
  currentStore = store;
  return store;
}

/** Seeds an own set (for the current user) with features and returns its id. */
function seedOwnSet(
  store: ReturnType<typeof createViewerStore>,
  features: AnnotationFeature[],
): string {
  const setId = store.getState().ensureOwnSet();
  store.getState().updateSetFeatures(setId, features);
  return setId;
}

/** Seeds a peer set with features and returns its id. */
function seedPeerSet(
  store: ReturnType<typeof createViewerStore>,
  createdBy: string,
  features: AnnotationFeature[],
): string {
  const setId = crypto.randomUUID();
  store.getState().seedAnnotations([{ id: setId, createdBy, features }]);
  return setId;
}

function renderController() {
  return render(<AnnotationsControl />);
}

// -----------------------------------------------------------------------
// Own-first ordering
// -----------------------------------------------------------------------

describe("AnnotationsControl — own-first ordering", () => {
  test("own set's file block appears before peer blocks", () => {
    const store = buildStore();
    seedOwnSet(store, [makeFeature("f1")]);
    seedPeerSet(store, "peer-a", [makeFeature("f2")]);
    seedPeerSet(store, "peer-b", [makeFeature("f3")]);

    renderController();

    const blocks = screen.getAllByTestId(/^node-link-/);
    // Own set is first → "Annotation Set 1"
    expect(blocks[0]).toHaveTextContent("Annotation Set 1");
  });

  test("own file block is labeled 'Annotation Set 1'", () => {
    const store = buildStore();
    seedOwnSet(store, [makeFeature("f1")]);

    renderController();

    expect(screen.getByTestId("node-link-Annotation Set 1")).toBeInTheDocument();
  });

  test("peer file block is labeled 'Annotation Set 2' when own is first", () => {
    const store = buildStore();
    seedOwnSet(store, [makeFeature("f1")]);
    seedPeerSet(store, "peer-xyz", [makeFeature("f2")]);

    renderController();

    expect(screen.getByTestId("node-link-Annotation Set 2")).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------
// Empty own section injection
// -----------------------------------------------------------------------

describe("AnnotationsControl — empty own block", () => {
  test("renders an own file block even when the user has no annotations yet", () => {
    buildStore(); // empty store — own user has no set

    renderController();

    // ensureOwnSet is not called at render time (only on first draw), so an
    // empty store shows zero blocks until the first draw.
    expect(screen.queryAllByTestId(/^node-link-/)).toHaveLength(0);
  });

  test("no blocks render when ownUserId is unknown", () => {
    currentUserId = undefined;
    buildStore();

    renderController();

    expect(screen.queryAllByTestId(/^node-link-/)).toHaveLength(0);

    // Restore for subsequent tests.
    currentUserId = "own-user";
  });
});

// -----------------------------------------------------------------------
// Editable gating — own vs peers
// -----------------------------------------------------------------------

describe("AnnotationsControl — editable gating", () => {
  test("own AnnotationsList is rendered with editable=true", () => {
    const store = buildStore();
    const setId = seedOwnSet(store, [makeFeature("f1")]);

    renderController();

    const ownList = screen.getByTestId(`annotations-list-${setId}`);
    expect(ownList).toHaveAttribute("data-editable", "true");
  });

  test("peer AnnotationsList is rendered with editable=false", () => {
    const store = buildStore();
    const peerSetId = seedPeerSet(store, "peer-a", [makeFeature("f1")]);

    renderController();

    const peerList = screen.getByTestId(`annotations-list-${peerSetId}`);
    expect(peerList).toHaveAttribute("data-editable", "false");
  });
});
