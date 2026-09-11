import { render, screen, waitFor } from "@testing-library/react";
import { ActionFunctionArgs, createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

import ObjectsRoute, { handle } from "~/routes/objects/objects.route";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: {},
  authMiddleware: vi.fn(),
}));
vi.mock("~/.server/requestDurationMiddleware", () => ({
  requestDurationMiddleware: vi.fn(),
}));
vi.mock("~/routes/connections/connections.server", () => ({
  getConnection: vi.fn(),
}));
vi.mock("~/utils/listObjectsClient", () => ({
  listObjectsClient: vi.fn(),
}));

vi.mock("~/routes/favorites/useFavorite", () => ({
  useFavorite: () => ({ isFavorite: false, isPending: false, toggle: vi.fn() }),
}));

vi.mock("@cytario/design", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cytario/design")>();
  return {
    ...actual,
    useToast: () => ({ toast: vi.fn(), toasts: [], removeToast: vi.fn() }),
  };
});

vi.mock("~/components/.client/ImageViewer/components/ImageViewer", () => ({
  ImageViewer: () => <canvas id="deckgl-overlay"></canvas>,
}));

vi.mock("~/components/.client/SpatialDataViewer/components/SpatialDataViewer", () => ({
  SpatialDataViewer: () => <div data-testid="spatialdata-viewer-stub"></div>,
}));

// resolveResourceId throws for connections missing from the store — the mock
// preserves that so a render-time call in the .zarr branch would crash the
// render (the SSR failure mode: the server-side connections store is empty).
const resolveResourceIdMock = vi.fn((resourceId: string): never => {
  throw new Error(`No connection found for ${resourceId}`);
});
vi.mock("~/utils/connectionsStore/selectors", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/connectionsStore/selectors")>();
  return {
    ...actual,
    resolveResourceId: (resourceId: string) => resolveResourceIdMock(resourceId),
  };
});

vi.mock("~/components/.client/ImageViewer/utils/getSelectionStats", () => ({
  getSelectionStats: vi.fn(
    () =>
      new Promise((resolve) =>
        resolve({
          domain: [0, 65535],
          contrastLimits: [655, 64879],
          histogram: expect.any(Uint32Array),
        }),
      ),
  ),
}));

vi.mock("~/components/.client/ImageViewer/state/fetchImage", () => ({
  loadSingleFileOmeTiff: vi.fn(
    () => new Promise((resolve) => resolve([{ data: [], metadata: mock.metadata() }])),
  ),
}));

describe("Bucket Route", () => {
  test("handle.node builds the current TreeNode from params + data", () => {
    const mockArgs = {
      params: {
        id: "aws-test-bucket",
        "*": "bucket/folder/file.ome.tiff",
      },
      loaderData: {
        connectionId: "aws-test-bucket",
        connectionName: "aws-test-bucket",
        bucketName: "test-bucket",
        connectionConfig: mock.connectionConfig({ prefix: "" }),
      },
    } as unknown as ActionFunctionArgs;

    expect(handle.node(mockArgs)).toEqual({
      id: "aws-test-bucket/bucket/folder/file.ome.tiff",
      connectionId: "aws-test-bucket",
      connectionName: "aws-test-bucket",
      pathName: "bucket/folder/file.ome.tiff",
      name: "file.ome.tiff",
      type: "directory",
      children: [],
    });
  });

  test("renders `DirectoryView`, if there are multiple nodes", async () => {
    const RemixStub = createRoutesStub([
      {
        path: "/connections/:id",
        Component: ObjectsRoute,
        handle,
        loader: () => {
          return {
            connectionId: "aws-test-bucket",
            connectionName: "aws-test-bucket",
            credentials: mock.credentials(),
            connectionConfig: mock.connectionConfig(),
            user: mock.user(),
            nodes: [
              mock.treeNode({ name: "First Test Directory" }),
              mock.treeNode({ name: "Second Test Directory" }),
            ],
            bucketName: "test-bucket",
            pathName: "",
            name: "test-bucket",
          };
        },
      },
    ]);

    render(<RemixStub initialEntries={["/connections/aws-test-bucket"]} />);

    expect(await screen.findByText(/Second Test Directory/i)).toBeInTheDocument();
  });

  test("renders `Viewer` for given `pathName`", async () => {
    const RemixStub = createRoutesStub([
      {
        path: "/connections/:id/*",
        Component: ObjectsRoute,
        handle,
        loader: () => {
          return {
            connectionId: "aws-test-bucket",
            connectionName: "aws-test-bucket",
            credentials: mock.credentials(),
            connectionConfig: mock.connectionConfig(),
            user: mock.user(),
            nodes: [],
            pathName: "test/path/to/file.ome.tiff",
            urlPath: "test/path/to/file.ome.tiff",
            bucketName: "test-bucket",
            name: "file.ome.tiff",
            isSingleFile: true,
          };
        },
      },
    ]);

    const { container } = render(
      <RemixStub initialEntries={["/connections/aws-test-bucket/test-file.ome.tiff"]} />,
    );

    await waitFor(() => {
      expect(container.querySelector("canvas#deckgl-overlay")).toBeInTheDocument();
    });
  });

  test("renders the SpatialData viewer for a bare .sdata store path", async () => {
    const RemixStub = createRoutesStub([
      {
        path: "/connections/:id/*",
        Component: ObjectsRoute,
        handle,
        loader: () => {
          return {
            connectionId: "aws-test-bucket",
            connectionName: "aws-test-bucket",
            credentials: mock.credentials(),
            connectionConfig: mock.connectionConfig(),
            user: mock.user(),
            nodes: [],
            pathName: "Xenium_Protein_HumanKidney_tiny.sdata",
            urlPath: "Xenium_Protein_HumanKidney_tiny.sdata",
            bucketName: "test-bucket",
            name: "Xenium_Protein_HumanKidney_tiny.sdata",
            isSingleFile: true,
          };
        },
      },
    ]);

    render(<RemixStub initialEntries={["/connections/aws-test-bucket/store.sdata"]} />);

    await waitFor(() => {
      expect(screen.getByTestId("spatialdata-viewer-stub")).toBeInTheDocument();
    });
  });

  test("renders a plain .zarr leaf without resolving the httpsUrl during render", async () => {
    const RemixStub = createRoutesStub([
      {
        path: "/connections/:id/*",
        Component: ObjectsRoute,
        handle,
        loader: () => {
          return {
            connectionId: "aws-test-bucket",
            connectionName: "aws-test-bucket",
            credentials: mock.credentials(),
            connectionConfig: mock.connectionConfig(),
            user: mock.user(),
            nodes: [],
            pathName: "store.zarr",
            urlPath: "store.zarr",
            bucketName: "test-bucket",
            name: "store.zarr",
            isSingleFile: true,
          };
        },
      },
    ]);

    // resolveResourceId throws in this test (empty connections store, the SSR
    // state); a render-time call would crash the render into an error boundary
    // instead of the loading fallback — the exact e2e failure mode.
    render(<RemixStub initialEntries={["/connections/aws-test-bucket/store.zarr"]} />);

    await waitFor(() => {
      expect(screen.getByText("Inspecting store…")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Unexpected Application Error/i)).not.toBeInTheDocument();
  });
});
