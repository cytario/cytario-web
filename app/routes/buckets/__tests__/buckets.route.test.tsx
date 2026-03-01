import { render, screen } from "@testing-library/react";
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
vi.mock("~/.server/auth/keycloakAdmin", () => ({
  getManageableScopes: vi.fn(),
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
      hydrationData={{
        loaderData: {
          "0": {
            nodes,
            adminScopes: [],
            userId: "test-user",
            credentials: {},
            bucketConfigs: nodes.map((n) => ({
              id: n.bucketName,
              name: n.bucketName,
              provider: n.provider,
              region: "us-east-1",
            })),
          },
        },
      }}
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
    test("renders empty state title and description", () => {
      renderBuckets([]);

      expect(
        screen.getByText("Start exploring your data"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "Add a storage connection to view your cloud storage.",
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
      createNode({
        name: "pathology-archive",
        bucketName: "pathology-archive",
        provider: "minio",
      }),
    ];

    test("renders storage connection cards with bucket names", () => {
      renderBuckets(nodes);

      expect(screen.getByText("research-data")).toBeInTheDocument();
      expect(screen.getByText("pathology-archive")).toBeInTheDocument();
    });

    test("renders Storage Connections section heading", () => {
      renderBuckets(nodes);

      expect(
        screen.getByText("Storage Connections"),
      ).toBeInTheDocument();
    });
  });

  describe("recently viewed", () => {
    test("renders section when recently viewed image items exist", () => {
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

    test("does not render recently viewed section when no recent items", () => {
      renderBuckets([
        createNode({ name: "test-bucket", bucketName: "test-bucket" }),
      ]);

      expect(
        screen.queryByText("Recently Viewed"),
      ).not.toBeInTheDocument();
    });
  });
});
