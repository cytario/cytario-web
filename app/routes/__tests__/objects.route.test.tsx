import { render, screen, waitFor } from "@testing-library/react";
import { ActionFunctionArgs, createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { getCrumbs } from "~/components/Breadcrumbs/getCrumbs";
import ObjectsRoute, { handle } from "~/routes/objects.route";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/components/.client/ImageViewer/components/ImageViewer", () => ({
  Viewer: () => <canvas id="deckgl-overlay"></canvas>,
}));

vi.mock("~/components/.client/ImageViewer/state/lzwDecoder", () => ({}));

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
  getCrumbs: vi.fn(),
}));

describe("Bucket Route", () => {
  test("handle calls `getCrumbs` with correct arguments", () => {
    const mockArgs = {
      params: {
        provider: "aws",
        bucketName: "test-bucket",
        "*": "bucket/folder/file.ome.tiff",
      },
    } as unknown as ActionFunctionArgs;

    handle.breadcrumb(mockArgs);

    expect(getCrumbs).toHaveBeenCalledWith("/buckets/aws", [
      "test-bucket",
      "bucket",
      "folder",
      "file.ome.tiff",
    ]);
  });

  test("renders `DirectoryView`, if there are multiple nodes", async () => {
    const RemixStub = createRoutesStub([
      {
        path: "/buckets/:provider/:bucketName",
        Component: ObjectsRoute,
        handle,
        loader: () => {
          return {
            credentials: mock.credentials(),
            bucketConfig: mock.bucketConfig(),
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

    render(<RemixStub initialEntries={["/buckets/aws/test-bucket"]} />);

    expect(
      await screen.findByText(/Second Test Directory/i)
    ).toBeInTheDocument();
  });

  test("renders `Viewer` for given `pathName`", async () => {
    const RemixStub = createRoutesStub([
      {
        path: "/buckets/:provider/:bucketName/*",
        Component: ObjectsRoute,
        handle,
        loader: () => {
          return {
            credentials: mock.credentials(),
            bucketConfig: mock.bucketConfig(),
            user: mock.user(),
            nodes: [],
            pathName: "test/path/to/file.ome.tiff",
            bucketName: "test-bucket",
            name: "file.ome.tiff",
            url: "https://example.com/test/path/to/file.ome.tiff",
          };
        },
      },
    ]);

    const { container } = render(
      <RemixStub
        initialEntries={["/buckets/aws/test-bucket/test-file.ome.tiff"]}
      />
    );

    await waitFor(() => {
      expect(
        container.querySelector("canvas#deckgl-overlay")
      ).toBeInTheDocument();
    });
  });
});
