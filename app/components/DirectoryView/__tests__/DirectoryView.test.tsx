import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { TreeNode } from "../buildDirectoryTree";
import { DirectoryView } from "../DirectoryView";
import { useLayoutStore } from "../useLayoutStore";
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
    useLayoutStore.setState({ showHiddenFiles: false });
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

    expect(screen.queryByText("Empty Directory")).not.toBeInTheDocument();
    expect(screen.getByText("Empty directory")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This folder is empty or you may not have permission to view its contents.",
      ),
    ).toBeInTheDocument();
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

  test("renders inline filter controls when showFilters is true", () => {
    renderDirectoryView({
      viewMode: "list",
      nodes: mockNodes,
      name: "Test Directory",
      showFilters: true,
    });

    expect(
      screen.getByRole("textbox", { name: "Filter files" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Show hidden")).toBeInTheDocument();
  });

  test("does not render inline filter controls when showFilters is false", () => {
    renderDirectoryView({
      viewMode: "list",
      nodes: mockNodes,
      name: "Test Directory",
      showFilters: false,
    });

    expect(
      screen.queryByRole("textbox", { name: "Filter files" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Show hidden")).not.toBeInTheDocument();
  });

  test("inline text filter narrows displayed nodes in list mode", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    renderDirectoryView({
      viewMode: "list",
      nodes: mockNodes,
      name: "Test Directory",
      showFilters: true,
    });

    const input = screen.getByRole("textbox", { name: "Filter files" });
    await user.type(input, "File1");

    expect(screen.getByText("File1.txt")).toBeInTheDocument();
    expect(screen.queryByText("Folder1")).not.toBeInTheDocument();
  });

  test("inline text filter narrows displayed nodes in grid mode", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    renderDirectoryView({
      viewMode: "grid-compact",
      nodes: mockNodes,
      name: "Test Directory",
      showFilters: true,
    });

    const input = screen.getByRole("textbox", { name: "Filter files" });
    await user.type(input, "Folder");

    expect(screen.getByText("Folder1")).toBeInTheDocument();
    expect(screen.queryByText("File1.txt")).not.toBeInTheDocument();
  });

  test("shows no-matches message in list mode when filter excludes all nodes", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    renderDirectoryView({
      viewMode: "list",
      nodes: mockNodes,
      name: "Test Directory",
      showFilters: true,
    });

    const input = screen.getByRole("textbox", { name: "Filter files" });
    await user.type(input, "zzz-no-match");

    expect(
      screen.getByText(/No items match the current filters/),
    ).toBeInTheDocument();
  });

  test("shows no-matches message in grid mode when filter excludes all nodes", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    renderDirectoryView({
      viewMode: "grid",
      nodes: mockNodes,
      name: "Test Directory",
      showFilters: true,
    });

    const input = screen.getByRole("textbox", { name: "Filter files" });
    await user.type(input, "zzz-no-match");

    expect(
      screen.getByText(/No items match the current filters/),
    ).toBeInTheDocument();
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
