import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { DashboardSection } from "../DashboardSection";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

vi.mock("~/components/DirectoryView/DirectoryViewTableDirectory", () => ({
  DirectoryViewTableDirectory: ({ nodes }: { nodes: TreeNode[] }) => (
    <div data-testid="directory-view-table">{nodes.length} items</div>
  ),
}));

vi.mock("~/components/DirectoryView/DirectoryViewGrid", () => ({
  DirectoryViewGrid: ({ nodes }: { nodes: TreeNode[] }) => (
    <div data-testid="directory-view-grid">{nodes.length} items</div>
  ),
}));

function makeNode(name: string): TreeNode {
  return {
    id: name,
    connectionId: "test-connection",
    connectionName: "test-connection",
    name,
    type: "file",
    pathName: name,
    children: [],
  };
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("DashboardSection", () => {
  test("renders nothing when nodes array is empty", () => {
    const { container } = renderWithRouter(
      <DashboardSection title="Empty" nodes={[]} viewMode="list" maxItems={10} to="/recent" />,
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
        to="/recent"
      />,
    );
    expect(screen.getByRole("heading", { name: "Recently Viewed" })).toBeInTheDocument();
  });

  test("slices nodes to maxItems", () => {
    const nodes = Array.from({ length: 5 }, (_, i) => makeNode(`file-${i}.csv`));
    renderWithRouter(
      <DashboardSection title="Files" nodes={nodes} viewMode="list" maxItems={3} to="/recent" />,
    );
    expect(screen.getByTestId("directory-view-table")).toHaveTextContent("3 items");
  });

  test("renders DirectoryViewTable for list viewMode", () => {
    renderWithRouter(
      <DashboardSection
        title="Files"
        nodes={[makeNode("a.csv")]}
        viewMode="list"
        maxItems={10}
        to="/recent"
      />,
    );
    expect(screen.getByTestId("directory-view-table")).toBeInTheDocument();
    expect(screen.queryByTestId("directory-view-grid")).not.toBeInTheDocument();
  });

  test("renders DirectoryViewGrid for grid viewMode", () => {
    renderWithRouter(
      <DashboardSection
        title="Files"
        nodes={[makeNode("a.csv")]}
        viewMode="grid"
        maxItems={10}
        to="/recent"
      />,
    );
    expect(screen.getByTestId("directory-view-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("directory-view-table")).not.toBeInTheDocument();
  });

  test("renders a 'View all' link pointing at `to`", () => {
    renderWithRouter(
      <DashboardSection
        title="Files"
        nodes={[makeNode("a.csv")]}
        viewMode="list"
        maxItems={10}
        to="/recent"
      />,
    );
    expect(screen.getByRole("link", { name: /View all/ })).toHaveAttribute("href", "/recent");
  });
});
