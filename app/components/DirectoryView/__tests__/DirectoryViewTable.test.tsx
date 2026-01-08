import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { TreeNode } from "../buildDirectoryTree";
import DirectoryTable from "../DirectoryViewTable";

describe("DirectoryViewTable", () => {
  describe("bucket type nodes", () => {
    const mockBucketNodes: TreeNode[] = [
      {
        type: "bucket",
        name: "my-aws-bucket",
        id: "aws/my-aws-bucket",
        children: [],
        _Bucket: {
          id: 1,
          name: "my-aws-bucket",
          provider: "aws",
          endpoint: "",
          region: "eu-central-1",
          roleArn: "arn:aws:iam::123456789:role/S3AccessRole",
          userId: "user-1",
        },
      },
      {
        type: "bucket",
        name: "minio-bucket",
        id: "minio/minio-bucket",
        children: [],
        _Bucket: {
          id: 2,
          name: "minio-bucket",
          provider: "minio",
          endpoint: "https://s3.cytar.io",
          region: null,
          roleArn: null,
          userId: "user-1",
        },
      },
    ];

    test("renders bucket columns: Name, Provider, Endpoint, Region, RoleARN", () => {
      const RemixStub = createRoutesStub([
        {
          path: "/",
          Component: () => <DirectoryTable nodes={mockBucketNodes} />,
        },
      ]);

      render(<RemixStub initialEntries={["/"]} />);

      // Check column headers
      expect(screen.getByText("Name")).toBeInTheDocument();
      expect(screen.getByText("Provider")).toBeInTheDocument();
      expect(screen.getByText("Endpoint")).toBeInTheDocument();
      expect(screen.getByText("Region")).toBeInTheDocument();
      expect(screen.getByText("RoleARN")).toBeInTheDocument();
    });

    test("renders bucket data with provider and endpoint", () => {
      const RemixStub = createRoutesStub([
        {
          path: "/",
          Component: () => <DirectoryTable nodes={mockBucketNodes} />,
        },
      ]);

      render(<RemixStub initialEntries={["/"]} />);

      // Check AWS bucket data
      expect(screen.getByText("my-aws-bucket")).toBeInTheDocument();
      expect(screen.getByText("aws")).toBeInTheDocument();
      expect(screen.getByText("eu-central-1")).toBeInTheDocument();
      expect(
        screen.getByText("arn:aws:iam::123456789:role/S3AccessRole")
      ).toBeInTheDocument();

      // Check MinIO bucket data
      expect(screen.getByText("minio-bucket")).toBeInTheDocument();
      expect(screen.getByText("minio")).toBeInTheDocument();
      expect(screen.getByText("https://s3.cytar.io")).toBeInTheDocument();
    });
  });

  describe("file type nodes", () => {
    const mockFileNodes: TreeNode[] = [
      {
        type: "file",
        name: "data.parquet",
        id: "test-bucket/folder/data.parquet",
        children: [],
        _Object: {
          Key: "folder/data.parquet",
          LastModified: new Date("2024-01-15T10:30:00Z"),
          Size: 1024 * 1024, // 1MB
        },
      },
      {
        type: "file",
        name: "results.csv",
        id: "test-bucket/folder/results.csv",
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
          Component: () => <DirectoryTable nodes={mockFileNodes} />,
        },
      ]);

      render(<RemixStub initialEntries={["/"]} />);

      // Check column headers
      expect(screen.getByText("Name")).toBeInTheDocument();
      expect(screen.getByText("Last Modified")).toBeInTheDocument();
      expect(screen.getByText("Size")).toBeInTheDocument();
    });

    test("renders file data with formatted size", () => {
      const RemixStub = createRoutesStub([
        {
          path: "/",
          Component: () => <DirectoryTable nodes={mockFileNodes} />,
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
        type: "directory",
        name: "images",
        id: "test-bucket/images",
        children: [],
      },
      {
        type: "directory",
        name: "data",
        id: "test-bucket/data",
        children: [],
      },
    ];

    test("renders only Name column for directories", () => {
      const RemixStub = createRoutesStub([
        {
          path: "/",
          Component: () => <DirectoryTable nodes={mockDirNodes} />,
        },
      ]);

      render(<RemixStub initialEntries={["/"]} />);

      // Check column header - only Name for directories
      expect(screen.getByText("Name")).toBeInTheDocument();
      // These should NOT be present for directory type
      expect(screen.queryByText("Last Modified")).not.toBeInTheDocument();
      expect(screen.queryByText("Size")).not.toBeInTheDocument();
      expect(screen.queryByText("Provider")).not.toBeInTheDocument();
    });

    test("renders directory names", () => {
      const RemixStub = createRoutesStub([
        {
          path: "/",
          Component: () => <DirectoryTable nodes={mockDirNodes} />,
        },
      ]);

      render(<RemixStub initialEntries={["/"]} />);

      expect(screen.getByText("images")).toBeInTheDocument();
      expect(screen.getByText("data")).toBeInTheDocument();
    });
  });
});
