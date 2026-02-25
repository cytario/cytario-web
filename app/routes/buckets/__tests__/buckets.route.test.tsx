import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

// Mock server-only imports to prevent SSR-only modules from loading in tests
vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: {},
  authMiddleware: vi.fn(),
}));
vi.mock("~/.server/auth/getPresignedUrl", () => ({
  getPresignedUrl: vi.fn(),
}));
vi.mock("~/.server/auth/getS3Client", () => ({
  getS3Client: vi.fn(),
}));
vi.mock("~/.server/auth/getSession", () => ({
  getSession: vi.fn(),
}));
vi.mock("~/.server/auth/getSessionCredentials", () => ({
  getSessionCredentials: vi.fn(),
}));
vi.mock("~/.server/auth/sessionStorage", () => ({
  SessionData: {},
  sessionStorage: { commitSession: vi.fn() },
}));
vi.mock("~/utils/bucketConfig", () => ({
  getBucketConfigsForUser: vi.fn(),
  deleteBucketConfig: vi.fn(),
}));
vi.mock("~/utils/getObjects", () => ({
  getObjects: vi.fn(),
}));
vi.mock("~/.generated/client", () => ({
  BucketConfig: {},
}));
vi.mock("~/routes/objects.route", () => ({
  ObjectPresignedUrl: {},
}));

vi.mock("@cytario/design", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@cytario/design")>();
  return { ...actual };
});

// Mock lazy-loaded client components
vi.mock(
  "~/components/.client/ImageViewer/state/ViewerStoreContext",
  () => ({
    ViewerStoreProvider: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  }),
);
vi.mock(
  "~/components/.client/ImageViewer/components/Image/ImagePreview",
  () => ({
    ImagePreview: () => <div data-testid="image-preview">Preview</div>,
  }),
);
vi.mock("~/utils/omeTiffOffsets", () => ({
  isOmeTiff: (key: string) => key.endsWith(".ome.tif"),
}));
vi.mock("~/utils/recentlyViewedStore/useRecentlyViewedStore", () => ({
  useRecentlyViewedStore: vi.fn(() => []),
}));
vi.mock("~/components/DirectoryView/NodeInfoModal", () => ({
  NodeInfoModal: () => null,
}));

const { useRecentlyViewedStore } = await import(
  "~/utils/recentlyViewedStore/useRecentlyViewedStore"
);
const { default: BucketsRoute } = await import(
  "~/routes/buckets/buckets.route"
);

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

function createNode(overrides: Partial<TreeNode> = {}): TreeNode {
  return {
    provider: "aws",
    bucketName: "test-bucket",
    name: "test-bucket",
    type: "bucket",
    children: [],
    ...overrides,
  };
}

function createNodeWithPreview(
  overrides: Partial<TreeNode> = {},
): TreeNode {
  return createNode({
    _Object: {
      Key: "sample.ome.tif",
      presignedUrl: "https://example.com/presigned",
    },
    ...overrides,
  });
}

/* ------------------------------------------------------------------ */
/*  Render helper                                                      */
/* ------------------------------------------------------------------ */

/**
 * Renders BucketsRoute inside a createRoutesStub, providing loader data
 * via hydrationData so useLoaderData() returns the expected shape.
 */
function renderBuckets(nodes: TreeNode[]) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: BucketsRoute,
    },
  ]);

  return render(
    <Stub
      initialEntries={["/"]}
      hydrationData={{ loaderData: { "0": { nodes } } }}
    />,
  );
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("BucketsRoute", () => {
  beforeEach(() => {
    vi.mocked(useRecentlyViewedStore).mockImplementation(
      (selector: unknown) => {
        if (typeof selector === "function") {
          return (selector as (state: { items: TreeNode[] }) => unknown)({
            items: [],
          });
        }
        return [];
      },
    );
  });

  describe("empty state", () => {
    test("renders empty state heading and description", () => {
      renderBuckets([]);

      expect(screen.getByText("Your Data Sources")).toBeInTheDocument();
      expect(
        screen.getByText("No data sources connected"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Connect your first cloud storage bucket to start exploring imaging data.",
        ),
      ).toBeInTheDocument();
    });

    test("renders Connect Storage link pointing to /connect-bucket", () => {
      renderBuckets([]);

      const link = screen.getByRole("link", { name: /Connect Storage/i });
      expect(link).toHaveAttribute("href", "/connect-bucket");
    });
  });

  describe("populated state", () => {
    const nodes = [
      createNode({
        name: "research-data",
        bucketName: "research-data",
        provider: "aws",
      }),
      createNodeWithPreview({
        name: "pathology-archive",
        bucketName: "pathology-archive",
        provider: "minio",
      }),
    ];

    test("renders page title and Connect Storage link", () => {
      renderBuckets(nodes);

      expect(screen.getByText("Your Data Sources")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Connect Storage/i }),
      ).toHaveAttribute("href", "/connect-bucket");
    });

    test("renders view mode segmented control with three options", () => {
      renderBuckets(nodes);

      expect(
        screen.getByRole("radiogroup", { name: "View mode" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "Large grid" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "Small grid" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "Table view" }),
      ).toBeInTheDocument();
    });

    test("renders bucket names in default grid view", () => {
      renderBuckets(nodes);

      expect(screen.getByText("research-data")).toBeInTheDocument();
      expect(screen.getByText("pathology-archive")).toBeInTheDocument();
    });

    test("renders info buttons for each connection in grid view", () => {
      renderBuckets(nodes);

      const infoButtons = screen.getAllByRole("button", {
        name: "Connection info",
      });
      expect(infoButtons).toHaveLength(2);
    });

    test("switches to table view and renders table with data", async () => {
      renderBuckets(nodes);

      await userEvent.click(
        screen.getByRole("radio", { name: "Table view" }),
      );

      const table = screen.getByRole("grid", { name: "Data sources" });
      expect(table).toBeInTheDocument();
      expect(within(table).getByText("research-data")).toBeInTheDocument();
      expect(
        within(table).getByText("pathology-archive"),
      ).toBeInTheDocument();
    });

    test("switches to small grid view", async () => {
      renderBuckets(nodes);

      await userEvent.click(
        screen.getByRole("radio", { name: "Small grid" }),
      );

      expect(screen.getByText("research-data")).toBeInTheDocument();
      expect(screen.getByText("pathology-archive")).toBeInTheDocument();
    });

    test("table view shows provider badges", async () => {
      renderBuckets(nodes);

      await userEvent.click(
        screen.getByRole("radio", { name: "Table view" }),
      );

      expect(screen.getByText("AWS")).toBeInTheDocument();
      expect(screen.getByText("MinIO")).toBeInTheDocument();
    });

    test("table view has info action buttons", async () => {
      renderBuckets(nodes);

      await userEvent.click(
        screen.getByRole("radio", { name: "Table view" }),
      );

      const infoButtons = screen.getAllByRole("button", {
        name: "Connection info",
      });
      expect(infoButtons).toHaveLength(2);
    });
  });

  describe("recently viewed", () => {
    test("renders section when recently viewed items exist", () => {
      const recentNodes = [
        createNode({
          name: "recent-file.ome.tif",
          bucketName: "research-data",
          type: "file",
          pathName: "recent-file.ome.tif",
        }),
      ];

      vi.mocked(useRecentlyViewedStore).mockImplementation(
        (selector: unknown) => {
          if (typeof selector === "function") {
            return (selector as (state: { items: TreeNode[] }) => unknown)({
              items: recentNodes,
            });
          }
          return recentNodes;
        },
      );

      renderBuckets([
        createNode({ name: "test-bucket", bucketName: "test-bucket" }),
      ]);

      expect(screen.getByText("Recently Viewed")).toBeInTheDocument();
      expect(screen.getByText("recent-file.ome.tif")).toBeInTheDocument();
    });

    test("does not render section when no recently viewed items", () => {
      renderBuckets([
        createNode({ name: "test-bucket", bucketName: "test-bucket" }),
      ]);

      expect(
        screen.queryByText("Recently Viewed"),
      ).not.toBeInTheDocument();
    });
  });
});
