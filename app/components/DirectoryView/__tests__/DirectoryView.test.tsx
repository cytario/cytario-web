import { render, screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import { createRoutesStub } from "react-router";
import { Mock } from "vitest";

import { TreeNode } from "../buildDirectoryTree";
import { DirectoryView } from "../DirectoryView";
import { useLayoutStore } from "../useLayoutStore";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("../useLayoutStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../useLayoutStore")>()),
  useLayoutStore: vi.fn(),
}));

vi.mock("~/components/.client/ImageViewer/state/fetchImage", () => ({
  loadSingleFileOmeTiff: vi.fn(),
}));

const mockSetViewMode = vi.fn();

const mockStoreDefaults = {
  viewMode: "list" as const,
  setViewMode: mockSetViewMode,
  headerSlot: null,
  setHeaderSlot: vi.fn(),
};

beforeEach(() => {
  // Reset Zustand store mock before each test
  (useLayoutStore as unknown as Mock).mockReturnValue(mockStoreDefaults);
});

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
            nodes={[]}
            bucketName="test-bucket"
            pathName="/test"
            name="Empty Directory"
          />
        ),
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(screen.getByText("[Placeholder: No items]")).toBeInTheDocument();
  });

  test("renders the toggle buttons and switches view mode", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <DirectoryView
            nodes={mockNodes}
            bucketName="test-bucket"
            pathName="/test"
            name="Test Directory"
          />
        ),
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    // Check that the view mode radio group is rendered
    expect(screen.getByRole("radiogroup", { name: /View mode/i })).toBeInTheDocument();

    // Simulate switching to grid via the radio group
    const gridRadios = screen.getAllByRole("radio", { name: /Small Grid/i });
    act(() => {
      fireEvent.click(gridRadios[0]);
    });

    // Verify that the view mode is updated in the Zustand store
    expect(mockSetViewMode).toHaveBeenCalledWith("grid-sm");
  });

  test("renders the DirectoryTable in list mode", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <DirectoryView
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
            nodes={mockNodes}
            bucketName="test-bucket"
            pathName="/test"
            name="Test Directory"
          />
        ),
      },
    ]);

    (useLayoutStore as unknown as Mock).mockReturnValue({
      ...mockStoreDefaults,
      viewMode: "grid-sm",
    });

    render(<RemixStub initialEntries={["/"]} />);

    // Verify that the DirectoryViewGrid is rendered
    expect(screen.getByText("File1.txt")).toBeInTheDocument();
    expect(screen.getByText("Folder1")).toBeInTheDocument();
  });
});
