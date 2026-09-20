import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createRoutesStub } from "react-router";

import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { StoragePickerModal } from "~/components/StoragePickerModal";
import { useConnectionsStore, type Connection } from "~/utils/connectionsStore/useConnectionsStore";

const CONNECTION_ID = "test-conn";

/** One level per parent path, so a pre-revealed deep folder behaves like the real tree. */
const { levels } = vi.hoisted(() => ({ levels: {} as Record<string, unknown[]> }));

vi.mock("~/components/DirectoryView/onExpand", () => ({
  onExpand: async (parent: { pathName: string }) => levels[parent.pathName] ?? [],
}));

vi.mock("~/routes/favorites/useFavorite", () => ({
  useFavorite: () => ({ isFavorite: false, isPending: false, toggle: vi.fn() }),
}));

const testConnection = {
  connectionConfig: { id: CONNECTION_ID, name: "Test Connection", grants: [] },
  credentials: null,
  status: "connected",
} as unknown as Connection;

function makeNode(pathName: string, type: TreeNode["type"], children?: TreeNode[]): TreeNode {
  return {
    id: `${CONNECTION_ID}/${pathName}`,
    connectionId: CONNECTION_ID,
    connectionName: "Test Connection",
    type,
    name: pathName.replace(/\/$/, "").split("/").pop() ?? "",
    pathName,
    children: type === "directory" ? (children ?? []) : children,
    loadState: type === "directory" ? "idle" : undefined,
  };
}

const directory = (pathName: string, children?: TreeNode[]) =>
  makeNode(pathName, "directory", children);
const file = (pathName: string) => makeNode(pathName, "file");

function seedLevels() {
  levels[""] = [
    directory("results/"),
    directory("configs/"),
    file("a.ome.tif"),
    file("b.ome.tif"),
    file("run1_a.ome.tif"),
    file("run1_b.ome.tif"),
  ];
  levels["results/"] = [file("results/inside.ome.tif")];
  levels["configs/"] = [directory("configs/jobs/")];
  levels["configs/jobs/"] = [];
}

function renderPicker(
  options: Parameters<typeof StoragePickerModal>[0]["options"],
  onConfirm = vi.fn(),
) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <StoragePickerModal options={options} onConfirm={onConfirm} onCancel={vi.fn()} />
      ),
    },
  ]);
  render(<Stub initialEntries={["/"]} />);
  return onConfirm;
}

/** File mode selects through the row checkbox, never the row itself. */
async function selectFile(name: string) {
  const row = await screen.findByRole("treeitem", { name });
  await userEvent.click(within(row).getByRole("checkbox"));
}

/** Both modes select a folder by clicking the folder's own row label. */
async function selectFolder(name: string) {
  const row = await screen.findByRole("treeitem", { name });
  await userEvent.click(within(row).getByText(name));
}

function confirmButton(label: string): HTMLElement {
  return screen.getByRole("button", { name: label });
}

beforeEach(() => {
  seedLevels();
  useConnectionsStore.setState({ connections: { [CONNECTION_ID]: testConnection } });
  useLayoutStore.setState({ showHiddenFiles: false });
});

describe("StoragePickerModal — file mode (default)", () => {
  test('titles the dialog "Add inputs" and confirms with "Add"', async () => {
    renderPicker({});

    expect(await screen.findByText("Add inputs")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save here" })).toBeNull();
  });

  test("the row checkbox selects exactly that file", async () => {
    const onConfirm = renderPicker({});

    await selectFile("a.ome.tif");
    expect(await screen.findByText("1 file selected")).toBeInTheDocument();

    await userEvent.click(confirmButton("Add"));
    expect(onConfirm).toHaveBeenCalledWith([[{ connectionId: CONNECTION_ID, path: "a.ome.tif" }]]);
  });

  test("the row checkbox toggles a file back off", async () => {
    const onConfirm = renderPicker({});

    await selectFile("a.ome.tif");
    await selectFile("a.ome.tif");
    expect(await screen.findByText("No files selected")).toBeInTheDocument();
    expect(confirmButton("Add")).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test("multiple file rows accumulate, one group each", async () => {
    const onConfirm = renderPicker({ multiple: true });

    await selectFile("a.ome.tif");
    await selectFile("b.ome.tif");
    await userEvent.click(confirmButton("Add"));

    expect(onConfirm).toHaveBeenCalledWith([
      [{ connectionId: CONNECTION_ID, path: "a.ome.tif" }],
      [{ connectionId: CONNECTION_ID, path: "b.ome.tif" }],
    ]);
  });

  test("group-by merges the selected files into one multi-file group", async () => {
    const onConfirm = renderPicker({ groupBy: true });

    expect(await screen.findByText("Group by")).toBeInTheDocument();
    await selectFile("run1_a.ome.tif");
    await selectFile("run1_b.ome.tif");
    await userEvent.click(screen.getByText("Group by"));
    await userEvent.click(await screen.findByRole("option", { name: /Filename prefix/ }));
    await userEvent.click(confirmButton("Add"));

    expect(onConfirm).toHaveBeenCalledWith([
      [
        { connectionId: CONNECTION_ID, path: "run1_a.ome.tif" },
        { connectionId: CONNECTION_ID, path: "run1_b.ome.tif" },
      ],
    ]);
  });

  test('the glob filter and "Add all" stay available and select every file in the level', async () => {
    const onConfirm = renderPicker({ globFilter: true });

    expect(await screen.findByPlaceholderText("Filter (optional)")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Add all" }));
    expect(await screen.findByText("4 files selected")).toBeInTheDocument();
    await userEvent.click(confirmButton("Add"));

    expect(onConfirm).toHaveBeenCalledWith([
      [{ connectionId: CONNECTION_ID, path: "a.ome.tif" }],
      [{ connectionId: CONNECTION_ID, path: "b.ome.tif" }],
      [{ connectionId: CONNECTION_ID, path: "run1_a.ome.tif" }],
      [{ connectionId: CONNECTION_ID, path: "run1_b.ome.tif" }],
    ]);
  });

  test("a folder row offers no checkbox and is not selectable", async () => {
    renderPicker({});

    const folderRow = await screen.findByRole("treeitem", { name: "results" });
    expect(within(folderRow).queryByRole("checkbox")).toBeNull();

    await userEvent.click(within(folderRow).getByText("results"));
    expect(await screen.findByText("No files selected")).toBeInTheDocument();
    expect(confirmButton("Add")).toBeDisabled();
  });
});

describe("StoragePickerModal — folder mode", () => {
  test('titles the dialog "Choose a destination" and confirms with "Save here"', async () => {
    renderPicker({ select: "folder" });

    expect(await screen.findByText("Choose a destination")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Save here" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
  });

  test("clicking a folder selects it with a prefix-relative path", async () => {
    const onConfirm = renderPicker({ select: "folder" });

    await selectFolder("results");
    expect(await screen.findByText("Destination: results/")).toBeInTheDocument();
    await userEvent.click(confirmButton("Save here"));

    expect(onConfirm).toHaveBeenCalledWith([[{ connectionId: CONNECTION_ID, path: "results/" }]]);
  });

  test("the connection root is selectable as the empty prefix", async () => {
    const onConfirm = renderPicker({ select: "folder" });

    await selectFolder("Test Connection");
    expect(await screen.findByText("Destination: connection root")).toBeInTheDocument();
    await userEvent.click(confirmButton("Save here"));

    expect(onConfirm).toHaveBeenCalledWith([[{ connectionId: CONNECTION_ID, path: "" }]]);
  });

  test("exactly one folder is selectable at a time", async () => {
    const onConfirm = renderPicker({ select: "folder" });

    await selectFolder("results");
    await selectFolder("Test Connection");
    await selectFolder("results");
    await userEvent.click(confirmButton("Save here"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith([[{ connectionId: CONNECTION_ID, path: "results/" }]]);
  });

  test("clicking a folder does not merely expand it", async () => {
    renderPicker({ select: "folder" });

    await selectFolder("results");

    // The expand chevron is still present and unexpanded — selection, not navigation.
    expect(await screen.findByRole("button", { name: "Expand results" })).toBeInTheDocument();
    expect(await screen.findByText("Destination: results/")).toBeInTheDocument();
  });

  test("a file row click leaves the chosen destination untouched", async () => {
    const onConfirm = renderPicker({ select: "folder" });

    await selectFolder("results");
    await userEvent.click(await screen.findByText("a.ome.tif"));
    await userEvent.click(confirmButton("Save here"));

    expect(onConfirm).toHaveBeenCalledWith([[{ connectionId: CONNECTION_ID, path: "results/" }]]);
  });

  test("file-only affordances are not shown", async () => {
    renderPicker({ select: "folder", globFilter: true, groupBy: true });

    expect(await screen.findByText("No folder selected")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Filter (optional)")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add all" })).toBeNull();
    expect(screen.queryByText("Group by")).toBeNull();
  });

  test("confirm is disabled until a destination is chosen", async () => {
    renderPicker({ select: "folder" });

    expect(await screen.findByRole("button", { name: "Save here" })).toBeDisabled();
    await selectFolder("results");
    expect(confirmButton("Save here")).not.toBeDisabled();
  });
});

describe("StoragePickerModal — folder mode with an initial path", () => {
  test("the initial folder is pre-selected but the root still spans the connection", async () => {
    renderPicker({ select: "folder", initialPath: "configs/" });

    expect(await screen.findByText("Destination: configs/")).toBeInTheDocument();
    // A sibling of the initial folder is on screen, so the whole connection is reachable.
    expect(await screen.findByRole("treeitem", { name: "results" })).toBeInTheDocument();
  });

  test("a folder outside the initial path is still selectable", async () => {
    const onConfirm = renderPicker({ select: "folder", initialPath: "configs/" });

    await selectFolder("results");
    expect(await screen.findByText("Destination: results/")).toBeInTheDocument();
    await userEvent.click(confirmButton("Save here"));

    expect(onConfirm).toHaveBeenCalledWith([[{ connectionId: CONNECTION_ID, path: "results/" }]]);
  });

  test("the connection root is still selectable as the empty prefix", async () => {
    const onConfirm = renderPicker({ select: "folder", initialPath: "configs/" });

    await selectFolder("Test Connection");
    expect(await screen.findByText("Destination: connection root")).toBeInTheDocument();
    await userEvent.click(confirmButton("Save here"));

    expect(onConfirm).toHaveBeenCalledWith([[{ connectionId: CONNECTION_ID, path: "" }]]);
  });

  test("a nested initial path is pre-selected once its level is expanded", async () => {
    const onConfirm = renderPicker({ select: "folder", initialPath: "configs/jobs" });

    // DirectoryViewTree does not cascade a reveal into a nested level, so the folder
    // is pre-selected when the analyst expands the level that holds it.
    await userEvent.click(await screen.findByRole("button", { name: "Expand configs" }));
    expect(await screen.findByText("Destination: configs/jobs/")).toBeInTheDocument();
    await userEvent.click(confirmButton("Save here"));

    expect(onConfirm).toHaveBeenCalledWith([
      [{ connectionId: CONNECTION_ID, path: "configs/jobs/" }],
    ]);
  });

  test("a pre-selected folder does not survive being replaced", async () => {
    const onConfirm = renderPicker({ select: "folder", initialPath: "configs/" });

    await selectFolder("configs");
    await selectFolder("results");
    await userEvent.click(confirmButton("Save here"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith([[{ connectionId: CONNECTION_ID, path: "results/" }]]);
  });

  test("an initial path that does not exist pre-selects nothing", async () => {
    const onConfirm = renderPicker({ select: "folder", initialPath: "missing/" });

    expect(await screen.findByText("No folder selected")).toBeInTheDocument();
    expect(confirmButton("Save here")).toBeDisabled();

    await selectFolder("Test Connection");
    await userEvent.click(confirmButton("Save here"));
    expect(onConfirm).toHaveBeenCalledWith([[{ connectionId: CONNECTION_ID, path: "" }]]);
  });

  test("file mode ignores the initial path as a folder pre-selection", async () => {
    const onConfirm = renderPicker({ initialPath: "configs/" });

    expect(await screen.findByText("Add inputs")).toBeInTheDocument();
    expect(await screen.findByText("No files selected")).toBeInTheDocument();
    expect(confirmButton("Add")).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
