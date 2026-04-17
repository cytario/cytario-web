import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { TreeNode } from "../buildDirectoryTree";
import { DirectoryViewTable } from "../DirectoryViewTable";

// Mock the connections store
vi.mock("~/utils/connectionsStore", () => ({
  useConnectionsStore: vi.fn((selector) => {
    const connections: Record<string, { connectionConfig: Record<string, unknown> }> = {
      "aws-my-aws-bucket": {
        connectionConfig: {
          bucketName: "my-aws-bucket",
          provider: "aws",
          endpoint: "",
          region: "eu-central-1",
          roleArn: "arn:aws:iam::123456789:role/S3AccessRole",
          ownerScope: "cytario",
          createdBy: "admin@cytario.com",
        },
      },
      "minio-minio-bucket": {
        connectionConfig: {
          bucketName: "minio-bucket",
          provider: "minio",
          endpoint: "https://s3.cytar.io",
          region: null,
          roleArn: null,
          ownerScope: "cytario/lab",
          createdBy: "lab@cytario.com",
        },
      },
    };
    return selector({ connections });
  }),
}));

describe("DirectoryViewTable", () => {
  describe("bucket type nodes", () => {
    const mockBucketNodes: TreeNode[] = [
      {
        id: "aws-my-aws-bucket",
        connectionName: "aws-my-aws-bucket",
        type: "bucket",
        name: "my-aws-bucket",
        bucketName: "my-aws-bucket",
        provider: "aws",
        pathName: "",
        children: [],
      },
      {
        id: "minio-minio-bucket",
        connectionName: "minio-minio-bucket",
        type: "bucket",
        name: "minio-bucket",
        bucketName: "minio-bucket",
        provider: "minio",
        pathName: "",
        children: [],
      },
    ];

    test("renders bucket columns: Name, Scope, Provider, Region visible; Endpoint, Created By, RoleARN hidden", () => {
      const RemixStub = createRoutesStub([
        {
          path: "/",
          Component: () => <DirectoryViewTable nodes={mockBucketNodes} />,
        },
      ]);

      render(<RemixStub initialEntries={["/"]} />);

      expect(screen.getByText("Name")).toBeInTheDocument();
      expect(screen.getByText("Scope")).toBeInTheDocument();
      expect(screen.getByText("Provider")).toBeInTheDocument();
      expect(screen.getByText("Region")).toBeInTheDocument();
      // Endpoint, Created By, and RoleARN are hidden by default
      expect(screen.queryByText("Endpoint")).not.toBeInTheDocument();
      expect(screen.queryByText("Created By")).not.toBeInTheDocument();
      expect(screen.queryByText("RoleARN")).not.toBeInTheDocument();
    });

    test("renders bucket data with provider and endpoint", () => {
      const RemixStub = createRoutesStub([
        {
          path: "/",
          Component: () => <DirectoryViewTable nodes={mockBucketNodes} />,
        },
      ]);

      render(<RemixStub initialEntries={["/"]} />);

      // Check bucket names
      expect(screen.getByText("my-aws-bucket")).toBeInTheDocument();
      expect(screen.getByText("minio-bucket")).toBeInTheDocument();

      // Provider and region values appear in body cells (inside aria-hidden table)
      const body = document.body.textContent ?? "";
      expect(body).toContain("aws");
      expect(body).toContain("minio");
      expect(body).toContain("eu-central-1");
    });
  });

  describe("file type nodes", () => {
    const mockFileNodes: TreeNode[] = [
      {
        id: "folder/data.parquet",
        connectionName: "test-connection",
        type: "file",
        name: "data.parquet",
        bucketName: "test-bucket",
        pathName: "folder/data.parquet",
        provider: "test-provider",
        children: [],
        _Object: {
          Key: "folder/data.parquet",
          LastModified: new Date("2024-01-15T10:30:00Z"),
          Size: 1024 * 1024, // 1MB
        },
      },
      {
        id: "folder/results.csv",
        connectionName: "test-connection",
        type: "file",
        name: "results.csv",
        bucketName: "test-bucket",
        pathName: "folder/results.csv",
        provider: "test-provider",
        children: [],
        _Object: {
          Key: "folder/results.csv",
          LastModified: new Date("2024-02-20T14:00:00Z"),
          Size: 512,
        },
      },
    ];

    test("renders file columns: Name, Last Modified, Size", () => {
      const RemixStub = createRoutesStub([
        {
          path: "/",
          Component: () => <DirectoryViewTable nodes={mockFileNodes} />,
        },
      ]);

      render(<RemixStub initialEntries={["/"]} />);

      expect(screen.getByText("Name")).toBeInTheDocument();
      expect(screen.getByText("Last Modified")).toBeInTheDocument();
      expect(screen.getByText("Size")).toBeInTheDocument();
    });

    test("renders file data with formatted size", () => {
      const RemixStub = createRoutesStub([
        {
          path: "/",
          Component: () => <DirectoryViewTable nodes={mockFileNodes} />,
        },
      ]);

      render(<RemixStub initialEntries={["/"]} />);

      expect(screen.getByText("data.parquet")).toBeInTheDocument();
      expect(screen.getByText("results.csv")).toBeInTheDocument();
      // filesize formats 1024*1024 as "1.05 MB"
      expect(screen.getByText("1.05 MB")).toBeInTheDocument();
      expect(screen.getByText("512 B")).toBeInTheDocument();
    });
  });

  describe("directory type nodes", () => {
    const mockDirNodes: TreeNode[] = [
      {
        id: "images/",
        connectionName: "test-connection",
        type: "directory",
        name: "images",
        bucketName: "test-bucket",
        pathName: "images/",
        provider: "test-provider",
        children: [],
      },
      {
        id: "data/",
        connectionName: "test-connection",
        type: "directory",
        name: "data",
        bucketName: "test-bucket",
        pathName: "data/",
        provider: "test-provider",
        children: [],
      },
    ];

    test("renders file columns for directories: Name, Last Modified, Size", () => {
      const RemixStub = createRoutesStub([
        {
          path: "/",
          Component: () => <DirectoryViewTable nodes={mockDirNodes} />,
        },
      ]);

      render(<RemixStub initialEntries={["/"]} />);

      expect(screen.getByText("Name")).toBeInTheDocument();
      expect(screen.getByText("Last Modified")).toBeInTheDocument();
      expect(screen.getByText("Size")).toBeInTheDocument();
      expect(screen.queryByText("Provider")).not.toBeInTheDocument();
    });

    test("renders directory names", () => {
      const RemixStub = createRoutesStub([
        {
          path: "/",
          Component: () => <DirectoryViewTable nodes={mockDirNodes} />,
        },
      ]);

      render(<RemixStub initialEntries={["/"]} />);

      expect(screen.getByText("images")).toBeInTheDocument();
      expect(screen.getByText("data")).toBeInTheDocument();
    });
  });
});
