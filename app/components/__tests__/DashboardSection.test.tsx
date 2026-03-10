import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { DashboardSection } from "../DashboardSection";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

vi.mock("~/components/DirectoryView/DirectoryViewTable", () => ({
  DirectoryViewTable: ({ nodes }: { nodes: TreeNode[] }) => (
    <div data-testid="directory-view-table">{nodes.length} items</div>
  ),
}));

vi.mock("~/components/DirectoryView/DirectoryViewGrid", () => ({
  DirectoryViewGrid: ({
    nodes,
    viewMode,
  }: {
    nodes: TreeNode[];
    viewMode: string;
  }) => (
    <div data-testid="directory-view-grid" data-view-mode={viewMode}>
      {nodes.length} items
    </div>
  ),
}));

function makeNode(name: string): TreeNode {
  return {
    alias: "test-alias",
    name,
    type: "file",
    bucketName: "bucket",
    provider: "aws",
    children: [],
  };
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("DashboardSection", () => {
  test("renders nothing when nodes array is empty", () => {
    const { container } = renderWithRouter(
      <DashboardSection
        title="Empty"
        nodes={[]}
        viewMode="list"
        maxItems={10}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  test("renders the title", () => {
    renderWithRouter(
      <DashboardSection
        title="Recently Viewed"
        nodes={[makeNode("a.tiff")]}
        viewMode="list"
        maxItems={10}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Recently Viewed" }),
    ).toBeInTheDocument();
  });

  test("slices nodes to maxItems", () => {
    const nodes = Array.from({ length: 5 }, (_, i) =>
      makeNode(`file-${i}.csv`),
    );
    renderWithRouter(
      <DashboardSection
        title="Files"
        nodes={nodes}
        viewMode="list"
        maxItems={3}
      />,
    );
    expect(screen.getByTestId("directory-view-table")).toHaveTextContent(
      "3 items",
    );
  });

  test("renders DirectoryViewTable for list viewMode", () => {
    renderWithRouter(
      <DashboardSection
        title="Files"
        nodes={[makeNode("a.csv")]}
        viewMode="list"
        maxItems={10}
      />,
    );
    expect(screen.getByTestId("directory-view-table")).toBeInTheDocument();
    expect(screen.queryByTestId("directory-view-grid")).not.toBeInTheDocument();
  });

  test("renders DirectoryViewTable for list-wide viewMode", () => {
    renderWithRouter(
      <DashboardSection
        title="Files"
        nodes={[makeNode("a.csv")]}
        viewMode="list-wide"
        maxItems={10}
      />,
    );
    expect(screen.getByTestId("directory-view-table")).toBeInTheDocument();
  });

  test("renders DirectoryViewGrid for grid viewModes", () => {
    renderWithRouter(
      <DashboardSection
        title="Files"
        nodes={[makeNode("a.csv")]}
        viewMode="grid-md"
        maxItems={10}
      />,
    );
    expect(screen.getByTestId("directory-view-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("directory-view-table")).not.toBeInTheDocument();
  });

  test("shows 'Show all (N)' link when nodes exceed maxItems", () => {
    const nodes = Array.from({ length: 8 }, (_, i) =>
      makeNode(`file-${i}.csv`),
    );
    renderWithRouter(
      <DashboardSection
        title="Files"
        nodes={nodes}
        viewMode="list"
        maxItems={5}
        showAllHref="/recent"
      />,
    );
    expect(
      screen.getByRole("link", { name: /Show all \(8\)/ }),
    ).toBeInTheDocument();
  });

  test("shows 'View all' link when nodes do not exceed maxItems", () => {
    renderWithRouter(
      <DashboardSection
        title="Files"
        nodes={[makeNode("a.csv")]}
        viewMode="list"
        maxItems={10}
        showAllHref="/recent"
      />,
    );
    expect(screen.getByRole("link", { name: /View all/ })).toBeInTheDocument();
  });

  test("does not render link when showAllHref is not provided", () => {
    renderWithRouter(
      <DashboardSection
        title="Files"
        nodes={[makeNode("a.csv")]}
        viewMode="list"
        maxItems={10}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  test("renders custom actions", () => {
    renderWithRouter(
      <DashboardSection
        title="Files"
        nodes={[makeNode("a.csv")]}
        viewMode="list"
        maxItems={10}
        actions={<button data-testid="custom-action">Action</button>}
      />,
    );
    expect(screen.getByTestId("custom-action")).toBeInTheDocument();
  });
});
