import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { TreeNode } from "../buildDirectoryTree";
import { DirectoryViewTableDirectory } from "../DirectoryViewTableDirectory";

describe("DirectoryViewTableDirectory", () => {
  describe("file type nodes", () => {
    const mockFileNodes: TreeNode[] = [
      {
        id: "folder/data.parquet",
        connectionName: "test-connection",
        type: "file",
        name: "data.parquet",
        pathName: "folder/data.parquet",
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
        pathName: "folder/results.csv",
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
          Component: () => <DirectoryViewTableDirectory nodes={mockFileNodes} />,
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
          Component: () => <DirectoryViewTableDirectory nodes={mockFileNodes} />,
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
        pathName: "images/",
        children: [],
      },
      {
        id: "data/",
        connectionName: "test-connection",
        type: "directory",
        name: "data",
        pathName: "data/",
        children: [],
      },
    ];

    test("renders file columns for directories: Name, Last Modified, Size", () => {
      const RemixStub = createRoutesStub([
        {
          path: "/",
          Component: () => <DirectoryViewTableDirectory nodes={mockDirNodes} />,
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
          Component: () => <DirectoryViewTableDirectory nodes={mockDirNodes} />,
        },
      ]);

      render(<RemixStub initialEntries={["/"]} />);

      expect(screen.getByText("images")).toBeInTheDocument();
      expect(screen.getByText("data")).toBeInTheDocument();
    });
  });
});
