import { render, screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import { createRoutesStub } from "react-router";
import { Mock } from "vitest";

import { TreeNode } from "../buildDirectoryTree";
import { DirectoryView } from "../DirectoryView";
import { useDirectoryStore } from "../useDirectoryStore";

vi.mock("../useDirectoryStore", () => ({
  useDirectoryStore: vi.fn(),
}));

vi.mock("~/components/.client/ImageViewer/state/fetchImage", () => ({
  loadSingleFileOmeTiff: vi.fn(),
}));

const mockSetActiveTab = vi.fn();

const mockStoreDefaults = {
  activeTab: 0,
  setActiveTab: mockSetActiveTab,
  setBucketName: vi.fn(),
  setPathName: vi.fn(),
  setProvider: vi.fn(),
  tableColumns: {},
  setColumnWidth: vi.fn(),
  resetTableConfig: vi.fn(),
  tableSorting: {},
  setTableSorting: vi.fn(),
};

beforeEach(() => {
  // Reset Zustand store mock before each test
  (useDirectoryStore as unknown as Mock).mockReturnValue(mockStoreDefaults);
});

describe("DirectoryView Component", () => {
  const mockNodes = [
    { name: "File1.txt", type: "file" },
    { name: "Folder1", type: "directory" },
  ] as unknown as TreeNode[];

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

  test("renders the tabs and switches between them", () => {
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

    // Check that the tabs are rendered
    expect(screen.getByRole("tab", { name: /List/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Grid/i })).toBeInTheDocument();

    // Simulate switching tabs
    const gridTab = screen.getByRole("tab", { name: /grid/i });
    act(() => {
      fireEvent.click(gridTab);
    });

    // Verify that the active tab is updated in the Zustand store
    expect(mockSetActiveTab).toHaveBeenCalledWith(1);
  });

  test("renders the DirectoryTable in the List tab", () => {
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

    // Verify that the DirectoryTable is rendered by default
    expect(screen.getByText("File1.txt")).toBeInTheDocument();
    expect(screen.getByText("Folder1")).toBeInTheDocument();
  });

  test("renders the DirectoryViewGrid in the Grid tab", () => {
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

    (useDirectoryStore as unknown as Mock).mockReturnValue({
      ...mockStoreDefaults,
      activeTab: 1, // Simulate the Grid tab being active
    });

    render(<RemixStub initialEntries={["/"]} />);

    // Verify that the DirectoryViewGrid is rendered
    expect(screen.getByText("File1.txt")).toBeInTheDocument();
    expect(screen.getByText("Folder1")).toBeInTheDocument();
  });
});
