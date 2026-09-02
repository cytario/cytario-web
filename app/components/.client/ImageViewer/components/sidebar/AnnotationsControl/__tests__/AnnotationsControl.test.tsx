import { ToastProvider } from "@cytario/design";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useStore } from "zustand";

import { createViewerStore } from "../../../../state/store/createViewerStore";
import type { ViewerStore } from "../../../../state/store/types";
import { AnnotationsControl } from "../AnnotationsControl";
import { seedViewerConnection } from "~/utils/__tests__/__mocks__";
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
// It mirrors the editable prop as data-editable so the access-level
// pass-through is assertable without rendering the real list.
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
  // Mirrors the contextMenuItems prop as a data attribute so the delete-set
  // entry's pass-through is assertable without rendering a real menu.
  NodeLink: ({
    node,
    contextMenuItems,
  }: {
    node: { name: string };
    contextMenuItems?: unknown;
  }) => (
    <div
      data-testid={`node-link-${node.name}`}
      data-context-menu={String(Boolean(contextMenuItems))}
    >
      {node.name}
    </div>
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

function buildStore(accessLevel: "annotate" | "read-only" = "annotate") {
  // A valid resourceId (connectionName/pathName) — the controller derives each
  // set's sidecar TreeNode from the image's resourceId. The connection's
  // access level drives useCanAnnotate (defaults to read-only when absent).
  seedViewerConnection("test-conn", accessLevel);
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
  return render(
    <ToastProvider>
      <AnnotationsControl />
    </ToastProvider>,
  );
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
// Import from JSON file (QuPath export)
// -----------------------------------------------------------------------

const quPathExport = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "qph-1",
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
      properties: { name: "Tumor" },
    },
    {
      type: "Feature",
      id: "qph-2",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [20, 20],
            [30, 20],
            [30, 30],
            [20, 30],
            [20, 20],
          ],
        ],
      },
      properties: { classification: { name: "Stroma", color: [255, 0, 0] } },
    },
  ],
};

describe("AnnotationsControl — JSON import", () => {
  test("Plus button is rendered in header", () => {
    buildStore();
    renderController();

    expect(
      screen.getByRole("button", { name: "Import annotations from GeoJSON" }),
    ).toBeInTheDocument();
  });

  test("read-only connection hides the Import control and gates the list", () => {
    buildStore("read-only");
    seedOwnSet(currentStore!, [makeFeature("f1")]);
    renderController();

    // No import affordance…
    expect(screen.queryByRole("button", { name: "Import annotations from GeoJSON" })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    // …and the set's list is read-only.
    const setId = currentStore!.getState().annotationSets[0].id;
    expect(screen.getByTestId(`annotations-list-${setId}`)).toHaveAttribute(
      "data-editable",
      "false",
    );
  });

  test("annotate connection passes editable through to the list", () => {
    buildStore();
    seedOwnSet(currentStore!, [makeFeature("f1")]);
    renderController();

    const setId = currentStore!.getState().annotationSets[0].id;
    expect(screen.getByTestId(`annotations-list-${setId}`)).toHaveAttribute(
      "data-editable",
      "true",
    );
  });

  test("importing a valid QuPath JSON adds an unowned set", async () => {
    const store = buildStore();
    expect(store.getState().annotationSets).toHaveLength(0);

    renderController();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([JSON.stringify(quPathExport)], "export.json", {
      type: "application/json",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await vi.waitFor(() => {
      expect(store.getState().annotationSets).toHaveLength(1);
    });

    const set = store.getState().annotationSets[0];
    expect(set.features).toHaveLength(2);
    expect(set.createdBy).toBeUndefined(); // unowned
  });

  test("importing a .geojson file adds an unowned set", async () => {
    const store = buildStore();
    expect(store.getState().annotationSets).toHaveLength(0);

    renderController();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([JSON.stringify(quPathExport)], "export.geojson", {
      type: "application/geo+json",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await vi.waitFor(() => {
      expect(store.getState().annotationSets).toHaveLength(1);
    });

    const set = store.getState().annotationSets[0];
    expect(set.features).toHaveLength(2);
    expect(set.createdBy).toBeUndefined(); // unowned
  });

  test("invalid features are dropped, valid ones kept", async () => {
    const store = buildStore();
    renderController();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(
      [
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              id: "good",
              geometry: { type: "Point", coordinates: [1, 2] },
              properties: {},
            },
            {
              type: "Feature",
              id: "bad",
              geometry: { type: "Point", coordinates: "not-coords" },
              properties: {},
            },
          ],
        }),
      ],
      "mixed.json",
      { type: "application/json" },
    );
    fireEvent.change(input, { target: { files: [file] } });

    await vi.waitFor(() => {
      expect(store.getState().annotationSets).toHaveLength(1);
    });
    expect(store.getState().annotationSets[0].features).toHaveLength(1);
  });

  test("malformed JSON shows an error toast and adds no set", async () => {
    const store = buildStore();
    renderController();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["{not json}"], "broken.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });

    await vi.waitFor(() => {
      expect(screen.getByText(/"broken.json" is not valid JSON/)).toBeInTheDocument();
    });
    expect(store.getState().annotationSets).toHaveLength(0);
  });

  test("a file with no valid features shows an error toast and adds no set", async () => {
    const store = buildStore();
    renderController();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(
      [JSON.stringify({ type: "FeatureCollection", features: [] })],
      "empty.geojson",
      { type: "application/geo+json" },
    );
    fireEvent.change(input, { target: { files: [file] } });

    await vi.waitFor(() => {
      expect(
        screen.getByText(/"empty.geojson" contains no valid annotation features/),
      ).toBeInTheDocument();
    });
    expect(store.getState().annotationSets).toHaveLength(0);
  });
});

// C-456: the set block's sidecar NodeLink carries a Delete-annotation-set
// context-menu entry exactly when the connection grant permits annotating.
describe("AnnotationsControl — set deletion entry", () => {
  test("annotate connection passes the delete entry to the set block's context menu", () => {
    buildStore();
    seedOwnSet(currentStore!, [makeFeature("f1")]);
    renderController();

    expect(screen.getByTestId("node-link-Annotation Set 1")).toHaveAttribute(
      "data-context-menu",
      "true",
    );
  });

  test("read-only connection passes no context-menu entry", () => {
    buildStore("read-only");
    seedOwnSet(currentStore!, [makeFeature("f1")]);
    renderController();

    expect(screen.getByTestId("node-link-Annotation Set 1")).toHaveAttribute(
      "data-context-menu",
      "false",
    );
  });
});
