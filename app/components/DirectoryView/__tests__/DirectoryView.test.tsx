import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { TreeNode } from "../buildDirectoryTree";
import { DirectoryView } from "../DirectoryView";
import { useLayoutStore } from "../useLayoutStore";
import { useTableStore } from "~/components/Table/state/useTableStore";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/components/.client/ImageViewer/state/fetchImage", () => ({
  loadSingleFileOmeTiff: vi.fn(),
}));

function renderDirectoryView(
  props: Partial<React.ComponentProps<typeof DirectoryView>> & {
    nodes: TreeNode[];
    name: string;
    viewMode: React.ComponentProps<typeof DirectoryView>["viewMode"];
  },
) {
  const RemixStub = createRoutesStub([
    {
      path: "/",
      Component: () => <DirectoryView {...props} />,
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
    useLayoutStore.setState({ showHiddenFiles: false, showFilters: false });
    // Reset shared filter store between tests to avoid leakage from the
    // FilterBar writes across tests.
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

  test("renders the DirectoryViewGrid in grid-compact mode", () => {
    renderDirectoryView({
      viewMode: "grid-compact",
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

  test("renders the DirectoryViewTree in tree mode", () => {
    renderDirectoryView({
      viewMode: "tree",
      nodes: mockNodes,
      name: "Test Directory",
    });

    expect(
      screen.getByRole("tree", { name: /Directory tree/i }),
    ).toBeInTheDocument();
  });

  test("renders FilterBar when showFilters is true (non-list mode)", () => {
    useLayoutStore.setState({ showFilters: true });
    renderDirectoryView({
      viewMode: "grid",
      nodes: mockNodes,
      name: "Test Directory",
    });

    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
  });

  test("hides FilterBar in list mode (table column filters take over)", () => {
    useLayoutStore.setState({ showFilters: true });
    renderDirectoryView({
      viewMode: "list",
      nodes: mockNodes,
      name: "Test Directory",
    });

    expect(
      screen.queryByRole("textbox", { name: "Name" }),
    ).not.toBeInTheDocument();
  });

  test("does not render FilterBar when showFilters is false", () => {
    renderDirectoryView({
      viewMode: "list",
      nodes: mockNodes,
      name: "Test Directory",
    });

    expect(
      screen.queryByRole("textbox", { name: "Name" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Filter by Name" }),
    ).not.toBeInTheDocument();
  });

  test("name filter narrows displayed nodes in grid mode", async () => {
    useLayoutStore.setState({ showFilters: true });
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    renderDirectoryView({
      viewMode: "grid-compact",
      nodes: mockNodes,
      name: "Test Directory",
    });

    const input = screen.getByRole("textbox", { name: "Name" });
    await user.type(input, "Folder");

    expect(screen.getByText("Folder1")).toBeInTheDocument();
    expect(screen.queryByText("File1.txt")).not.toBeInTheDocument();
  });

  test("shows no-matches message in grid mode when filter excludes all nodes", async () => {
    useLayoutStore.setState({ showFilters: true });
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    renderDirectoryView({
      viewMode: "grid",
      nodes: mockNodes,
      name: "Test Directory",
    });

    const input = screen.getByRole("textbox", { name: "Name" });
    await user.type(input, "zzz-no-match");

    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  test("hidden files are excluded by default", () => {
    const nodesWithHidden = [
      ...mockNodes,
      mock.treeNode({ name: ".hidden-file", type: "file" }),
    ];

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

    const nodesWithHidden = [
      ...mockNodes,
      mock.treeNode({ name: ".hidden-file", type: "file" }),
    ];

    renderDirectoryView({
      viewMode: "list",
      nodes: nodesWithHidden,
      name: "Test Directory",
    });

    expect(screen.getByText(".hidden-file")).toBeInTheDocument();
  });

  test("renders secondary actions slot", () => {
    renderDirectoryView({
      viewMode: "list",
      nodes: mockNodes,
      name: "Test Directory",
      secondaryActions: <button data-testid="secondary-btn">Extra</button>,
    });

    expect(screen.getByTestId("secondary-btn")).toBeInTheDocument();
  });
});
