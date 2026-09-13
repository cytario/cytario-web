import { useTableStore } from "@cytario/design";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { createRoutesStub } from "react-router";

import { TreeNode } from "../buildDirectoryTree";
import { DirectoryView } from "../DirectoryView";
import { type ViewMode, useLayoutStore } from "../useLayoutStore";
import mock from "~/utils/__tests__/__mocks__";
import { buildVirtualNode } from "~/utils/treeNodeFactories";

vi.mock("~/components/.client/ImageViewer/state/fetchImage", () => ({
  loadSingleFileOmeTiff: vi.fn(),
}));

vi.mock("~/routes/favorites/useFavorite", () => ({
  useFavorite: () => ({ isFavorite: false, isPending: false, toggle: vi.fn() }),
}));

// DirectoryView now takes a single `node`; the tests still think in terms of
// `nodes` + `name` + `viewMode`, so translate: viewMode → store, and wrap the
// flat list in a virtual node.
function renderDirectoryView(props: {
  nodes: TreeNode[];
  name: string;
  viewMode: ViewMode;
  children?: ReactNode;
}) {
  const { nodes, name, viewMode, children } = props;
  useLayoutStore.setState({ viewMode });
  const node = buildVirtualNode(name, nodes);
  const RemixStub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <DirectoryView kind="entries" node={node}>
          {children}
        </DirectoryView>
      ),
    },
  ]);
  return render(<RemixStub initialEntries={["/"]} />);
}

describe("DirectoryView Component", () => {
  const mockNodes: TreeNode[] = [
    mock.treeNode({ name: "File1.txt", type: "file" }),
    mock.treeNode({ name: "Folder1", type: "directory" }),
  ];

  beforeEach(() => {
    useLayoutStore.setState({ showHiddenFiles: false });
    // Reset shared filter store between tests.
    useTableStore("entries").getState().setColumnFilters([]);
    useTableStore("connections").getState().setColumnFilters([]);
  });

  test("renders the component with the correct name", () => {
    renderDirectoryView({
      viewMode: "list",
      nodes: mockNodes,
      name: "Test Directory",
    });

    expect(screen.getByText("Test Directory")).toBeInTheDocument();
  });

  test("renders empty state when there are no nodes", () => {
    renderDirectoryView({
      viewMode: "list",
      nodes: [],
      name: "Empty Directory",
    });

    // Header still renders — empty state lives inside the child view.
    expect(screen.getByText("Empty Directory")).toBeInTheDocument();
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  test("renders the DirectoryTable in list mode", () => {
    renderDirectoryView({
      viewMode: "list",
      nodes: mockNodes,
      name: "Test Directory",
    });

    expect(screen.getByText("File1.txt")).toBeInTheDocument();
    expect(screen.getByText("Folder1")).toBeInTheDocument();
  });

  test("renders the DirectoryViewGrid in grid mode", () => {
    renderDirectoryView({
      viewMode: "grid",
      nodes: mockNodes,
      name: "Test Directory",
    });

    expect(screen.getByText("File1.txt")).toBeInTheDocument();
    expect(screen.getByText("Folder1")).toBeInTheDocument();
  });

  test("renders the DirectoryViewGrid in grid mode", () => {
    renderDirectoryView({
      viewMode: "grid",
      nodes: mockNodes,
      name: "Test Directory",
    });

    expect(screen.getByText("File1.txt")).toBeInTheDocument();
    expect(screen.getByText("Folder1")).toBeInTheDocument();
  });
  test("hidden files are excluded by default", () => {
    const nodesWithHidden = [...mockNodes, mock.treeNode({ name: ".hidden-file", type: "file" })];

    renderDirectoryView({
      viewMode: "list",
      nodes: nodesWithHidden,
      name: "Test Directory",
    });

    expect(screen.getByText("File1.txt")).toBeInTheDocument();
    expect(screen.queryByText(".hidden-file")).not.toBeInTheDocument();
  });

  test("hidden files are visible when showHiddenFiles is enabled in the store", () => {
    useLayoutStore.setState({ showHiddenFiles: true });

    const nodesWithHidden = [...mockNodes, mock.treeNode({ name: ".hidden-file", type: "file" })];

    renderDirectoryView({
      viewMode: "list",
      nodes: nodesWithHidden,
      name: "Test Directory",
    });

    expect(screen.getByText(".hidden-file")).toBeInTheDocument();
  });

  test("renders the children action slot", () => {
    renderDirectoryView({
      viewMode: "list",
      nodes: mockNodes,
      name: "Test Directory",
      children: <button data-testid="action-btn">Extra</button>,
    });

    expect(screen.getByTestId("action-btn")).toBeInTheDocument();
  });
});
