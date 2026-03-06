import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { ConnectionConfig as BucketConfig } from "~/.generated/client";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { StorageConnectionsGrid } from "~/components/StorageConnectionsGrid";

vi.mock("@cytario/design", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@cytario/design")>();
  return { ...actual };
});

vi.mock("~/components/DirectoryView/NodeInfoModal", () => ({
  NodeInfoModal: () => null,
}));

vi.mock("~/routes/objects.route", () => ({
  ObjectPresignedUrl: {},
}));

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

function createBucketConfig(
  overrides: Partial<BucketConfig> = {},
): BucketConfig {
  return {
    id: "cfg-1",
    name: "test-bucket",
    provider: "aws",
    region: "us-east-1",
    prefix: "",
    roleArn: null,
    endpoint: null,
    forcePathStyle: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: "user-1",
    ...overrides,
  } as BucketConfig;
}

/* ------------------------------------------------------------------ */
/*  Render helper                                                      */
/* ------------------------------------------------------------------ */

function renderGrid(
  nodes: TreeNode[],
  bucketConfigs: BucketConfig[] = [],
  name = "Storage Connections",
  children?: React.ReactNode,
) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <StorageConnectionsGrid
          nodes={nodes}
          bucketConfigs={bucketConfigs}
          name={name}
        >
          {children}
        </StorageConnectionsGrid>
      ),
    },
  ]);

  return render(<Stub initialEntries={["/"]} />);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("StorageConnectionsGrid", () => {
  describe("empty state", () => {
    test("renders nothing when nodes array is empty", () => {
      const { container } = renderGrid([]);

      expect(container.querySelector("section")).not.toBeInTheDocument();
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

    const configs = [
      createBucketConfig({
        name: "research-data",
        provider: "aws",
        region: "us-east-1",
      }),
      createBucketConfig({
        name: "pathology-archive",
        provider: "minio",
        region: "eu-west-1",
      }),
    ];

    test("renders section header with provided name", () => {
      renderGrid(nodes, configs, "My Connections");

      expect(screen.getByText("My Connections")).toBeInTheDocument();
    });

    test("renders a card for each node", () => {
      renderGrid(nodes, configs);

      expect(screen.getByText("research-data")).toBeInTheDocument();
      expect(screen.getByText("pathology-archive")).toBeInTheDocument();
    });

    test("renders children in the section header", () => {
      renderGrid(nodes, configs, "Storage Connections", (
        <button>Show all</button>
      ));

      expect(
        screen.getByRole("button", { name: "Show all" }),
      ).toBeInTheDocument();
    });

    test("cards are interactive with onPress navigation", () => {
      renderGrid(nodes, configs);

      // Cards render with role="button" via onPress (not <a> links).
      // StorageConnectionCard doesn't set aria-label on the outer div,
      // so we check for role="button" elements that contain the bucket names.
      const buttons = screen.getAllByRole("button");
      const cardButtons = buttons.filter(
        (b) =>
          b.textContent?.includes("research-data") ||
          b.textContent?.includes("pathology-archive"),
      );
      expect(cardButtons).toHaveLength(2);
    });
  });

  describe("config matching", () => {
    test("matches bucket configs by provider/name key", () => {
      const nodes = [
        createNode({
          name: "my-bucket",
          bucketName: "my-bucket",
          provider: "aws",
        }),
      ];

      const configs = [
        createBucketConfig({
          name: "my-bucket",
          provider: "aws",
          region: "ap-southeast-2",
        }),
      ];

      renderGrid(nodes, configs);

      // The card should render — the region from config is passed through
      expect(screen.getByText("my-bucket")).toBeInTheDocument();
    });

    test("renders card even when no matching config exists", () => {
      const nodes = [
        createNode({
          name: "orphan-bucket",
          bucketName: "orphan-bucket",
          provider: "aws",
        }),
      ];

      renderGrid(nodes, []);

      expect(screen.getByText("orphan-bucket")).toBeInTheDocument();
    });
  });

  describe("info button", () => {
    test("renders info buttons for each card", () => {
      const nodes = [
        createNode({
          name: "bucket-a",
          bucketName: "bucket-a",
          provider: "aws",
        }),
        createNode({
          name: "bucket-b",
          bucketName: "bucket-b",
          provider: "minio",
        }),
      ];

      renderGrid(nodes);

      const infoButtons = screen.getAllByRole("button", {
        name: /info/i,
      });
      expect(infoButtons).toHaveLength(2);
    });
  });
});
