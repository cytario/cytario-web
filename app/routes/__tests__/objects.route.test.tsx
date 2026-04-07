import { render, screen, waitFor } from "@testing-library/react";
import { ActionFunctionArgs, createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { getCrumbs } from "~/components/Breadcrumbs/getCrumbs";
import ObjectsRoute, { handle } from "~/routes/objects.route";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: {},
  authMiddleware: vi.fn(),
}));
vi.mock("~/.server/auth/getS3Client", () => ({
  getS3Client: vi.fn(),
}));
vi.mock("~/.server/requestDurationMiddleware", () => ({
  requestDurationMiddleware: vi.fn(),
}));
vi.mock("~/routes/connections/connections.server", () => ({
  getConnection: vi.fn(),
}));
vi.mock("~/utils/getObjects", () => ({
  getObjects: vi.fn(),
}));

vi.mock("@cytario/design", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@cytario/design")>();
  return {
    ...actual,
    useToast: () => ({ toast: vi.fn(), toasts: [], removeToast: vi.fn() }),
  };
});

vi.mock("~/components/.client/ImageViewer/components/ImageViewer", () => ({
  Viewer: () => <canvas id="deckgl-overlay"></canvas>,
}));

vi.mock("~/components/.client/ImageViewer/utils/getSelectionStats", () => ({
  getSelectionStats: vi.fn(
    () =>
      new Promise((resolve) =>
        resolve({
          domain: [0, 65535],
          contrastLimits: [655, 64879],
          histogram: expect.any(Uint32Array),
        })
      )
  ),
}));

vi.mock("~/components/.client/ImageViewer/state/fetchImage", () => ({
  loadSingleFileOmeTiff: vi.fn(
    () =>
      new Promise((resolve) =>
        resolve([{ data: [], metadata: mock.metadata() }])
      )
  ),
}));

vi.mock("~/components/Breadcrumbs/getCrumbs", () => ({
  getCrumbs: vi.fn(() => []),
}));

describe("Bucket Route", () => {
  test("handle calls `getCrumbs` with correct arguments", () => {
    const mockArgs = {
      params: {
        name: "aws-test-bucket",
        "*": "bucket/folder/file.ome.tiff",
      },
      data: {
        connectionName: "aws-test-bucket",
        bucketName: "test-bucket",
        connectionConfig: mock.connectionConfig({ prefix: "" }),
      },
    } as unknown as ActionFunctionArgs;

    handle.breadcrumb(mockArgs);

    expect(getCrumbs).toHaveBeenCalledWith(
      "/connections/aws-test-bucket",
      ["bucket", "folder", "file.ome.tiff"],
      {
        dataConnectionName: "aws-test-bucket",
        dataConnectionPath: "/connections/aws-test-bucket",
      }
    );
  });

  test("renders `DirectoryView`, if there are multiple nodes", async () => {
    const RemixStub = createRoutesStub([
      {
        path: "/connections/:name",
        Component: ObjectsRoute,
        handle,
        loader: () => {
          return {
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
            isPinned: false,
          };
        },
      },
    ]);

    render(<RemixStub initialEntries={["/connections/aws-test-bucket"]} />);

    expect(
      await screen.findByText(/Second Test Directory/i)
    ).toBeInTheDocument();
  });

  test("renders `Viewer` for given `pathName`", async () => {
    const RemixStub = createRoutesStub([
      {
        path: "/connections/:name/*",
        Component: ObjectsRoute,
        handle,
        loader: () => {
          return {
            connectionName: "aws-test-bucket",
            credentials: mock.credentials(),
            connectionConfig: mock.connectionConfig(),
            user: mock.user(),
            nodes: [],
            pathName: "test/path/to/file.ome.tiff",
            bucketName: "test-bucket",
            name: "file.ome.tiff",
            isSingleFile: true,
            isPinned: false,
          };
        },
      },
    ]);

    const { container } = render(
      <RemixStub
        initialEntries={["/connections/aws-test-bucket/test-file.ome.tiff"]}
      />
    );

    await waitFor(() => {
      expect(
        container.querySelector("canvas#deckgl-overlay")
      ).toBeInTheDocument();
    });
  });
});
