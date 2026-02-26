import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { TreeNode } from "../buildDirectoryTree";
import { DirectoryView } from "../DirectoryView";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/components/.client/ImageViewer/state/fetchImage", () => ({
  loadSingleFileOmeTiff: vi.fn(),
}));

describe("DirectoryView Component", () => {
  const mockNodes: TreeNode[] = [
    mock.treeNode({ name: "File1.txt", type: "file" }),
    mock.treeNode({ name: "Folder1", type: "directory" }),
  ];

  test("renders the component with the correct name", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <DirectoryView
            viewMode="list"
            nodes={mockNodes}
            bucketName="test-bucket"
            pathName="/test"
            name="Test Directory"
          />
        ),
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(screen.getByText("Test Directory")).toBeInTheDocument();
  });

  test("renders the placeholder when there are no nodes", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <DirectoryView
            viewMode="list"
            nodes={[]}
            bucketName="test-bucket"
            pathName="/test"
            name="Empty Directory"
          />
        ),
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(screen.getByText("No items found")).toBeInTheDocument();
  });

  test("renders the DirectoryTable in list mode", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <DirectoryView
            viewMode="list"
            nodes={mockNodes}
            bucketName="test-bucket"
            pathName="/test"
            name="Test Directory"
          />
        ),
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    // Verify that the DirectoryTable is rendered in list mode
    expect(screen.getByText("File1.txt")).toBeInTheDocument();
    expect(screen.getByText("Folder1")).toBeInTheDocument();
  });

  test("renders the DirectoryViewGrid in grid mode", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <DirectoryView
            viewMode="grid-sm"
            nodes={mockNodes}
            bucketName="test-bucket"
            pathName="/test"
            name="Test Directory"
          />
        ),
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    // Verify that the DirectoryViewGrid is rendered
    expect(screen.getByText("File1.txt")).toBeInTheDocument();
    expect(screen.getByText("Folder1")).toBeInTheDocument();
  });
});
