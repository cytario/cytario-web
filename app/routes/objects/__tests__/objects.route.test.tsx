import { render, screen, waitFor } from "@testing-library/react";
import { ActionFunctionArgs, createRoutesStub } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { viewerRegistry } from "~/components/viewerRegistry";
import ObjectsRoute, { handle } from "~/routes/objects/objects.route";
import mock from "~/utils/__tests__/__mocks__";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

function seedConnection(connectionId: string) {
  useConnectionsStore.setState({
    connections: {
      [connectionId]: {
        connectionConfig: mock.connectionConfig() as never,
        credentials: mock.credentials(),
        provider: {
          region: "eu-central-1",
          endpoint: null,
          allowsSharing: false,
          accessLevel: "annotate",
        },
        status: "connected",
      },
    },
  });
}

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
vi.mock("~/routes/recent/useRecordRecentView", () => ({
  useRecordRecentView: vi.fn(),
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
  afterEach(() => {
    viewerRegistry.__reset();
    useConnectionsStore.setState({ connections: {} });
  });

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

  function stubSingleFile(pathName: string) {
    return createRoutesStub([
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
            pathName,
            urlPath: pathName,
            bucketName: "test-bucket",
            name: pathName.split("/").pop() ?? pathName,
            isSingleFile: true,
          };
        },
      },
    ]);
  }

  test("renders a plugin viewer claiming the resource synchronously with the resolved url", async () => {
    seedConnection("aws-test-bucket");
    let receivedProps: { resourceId: string; httpsUrl: string } | undefined;
    viewerRegistry.scopedFor("spatialdata-plugin").register({
      match: (id) => id.endsWith("data.zarr"),
      component: (props: { resourceId: string; httpsUrl: string }) => {
        receivedProps = props;
        return <div data-testid="plugin-viewer" />;
      },
    });

    const StubZarr = stubSingleFile("test/path/to/data.zarr");
    const { container } = render(
      <StubZarr initialEntries={["/connections/aws-test-bucket/test/path/to/data.zarr"]} />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("plugin-viewer")).not.toBeNull();
    });
    expect(receivedProps).toMatchObject({
      resourceId: "aws-test-bucket/test/path/to/data.zarr",
    });
    expect(receivedProps?.httpsUrl).toContain("mock-bucket");
    expect(container.querySelector("canvas#deckgl-overlay")).not.toBeInTheDocument();
  });

  test("shows the Opening loader until the store populates, then renders the plugin viewer", async () => {
    let receivedUrl: string | null = null;
    viewerRegistry.scopedFor("spatialdata-plugin").register({
      match: (id) => id.endsWith("data.zarr"),
      component: (props: { httpsUrl: string }) => {
        receivedUrl = props.httpsUrl;
        return <div data-testid="plugin-viewer" />;
      },
    });

    const StubZarr = stubSingleFile("test/path/to/data.zarr");
    const { container } = render(
      <StubZarr initialEntries={["/connections/aws-test-bucket/test/path/to/data.zarr"]} />,
    );

    // Store lags the route render: the loader holds while resolution fails
    // with the connection absent.
    expect(container.querySelector("canvas#deckgl-overlay")).not.toBeInTheDocument();

    seedConnection("aws-test-bucket");

    await waitFor(() => {
      expect(screen.queryByTestId("plugin-viewer")).not.toBeNull();
    });
    expect(receivedUrl).toContain("mock-bucket");
  });

  test("persistent url-resolution failure falls back to the built-in viewer", async () => {
    // Connection present but without credentials: resolveResourceId keeps
    // failing even after the store populates — the dead-loader case.
    useConnectionsStore.setState({
      connections: {
        "aws-test-bucket": {
          connectionConfig: mock.connectionConfig() as never,
          credentials: null,
          provider: {
            region: "eu-central-1",
            endpoint: null,
            allowsSharing: false,
            accessLevel: "annotate",
          },
          status: "connected",
        },
      },
    });
    viewerRegistry.scopedFor("spatialdata-plugin").register({
      match: (id) => id.endsWith("data.zarr"),
      component: () => <div data-testid="plugin-viewer" />,
    });

    const StubZarr = stubSingleFile("test/path/to/data.zarr");
    const { container } = render(
      <StubZarr initialEntries={["/connections/aws-test-bucket/test/path/to/data.zarr"]} />,
    );

    await waitFor(() => {
      expect(container.querySelector("canvas#deckgl-overlay")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("plugin-viewer")).not.toBeInTheDocument();
  });

  test("falls back to the built-in viewer when a plugin's canHandle resolves false", async () => {
    seedConnection("aws-test-bucket");
    const canHandle = vi.fn().mockResolvedValue(false);
    viewerRegistry.scopedFor("sniffing-plugin").register({
      match: () => false,
      component: () => <div data-testid="plugin-viewer" />,
      canHandle,
    });

    const StubTiff = stubSingleFile("test/path/to/file.ome.tiff");
    const { container } = render(
      <StubTiff initialEntries={["/connections/aws-test-bucket/test/path/to/file.ome.tiff"]} />,
    );

    await waitFor(() => {
      expect(screen.queryByText("Opening…")).not.toBeNull();
    });
    await waitFor(() => {
      expect(container.querySelector("canvas#deckgl-overlay")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("plugin-viewer")).not.toBeInTheDocument();
    expect(canHandle).toHaveBeenCalledWith(
      "aws-test-bucket/test/path/to/file.ome.tiff",
      expect.stringContaining("mock-bucket"),
      expect.any(Function),
    );
  });

  test("empty registry renders the built-in viewer directly", async () => {
    const StubTiff = stubSingleFile("test/path/to/file.ome.tiff");
    const { container } = render(
      <StubTiff initialEntries={["/connections/aws-test-bucket/test/path/to/file.ome.tiff"]} />,
    );

    await waitFor(() => {
      expect(container.querySelector("canvas#deckgl-overlay")).toBeInTheDocument();
    });
  });
});
