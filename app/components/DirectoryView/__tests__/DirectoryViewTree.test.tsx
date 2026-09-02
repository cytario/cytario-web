import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { TreeNode } from "../buildDirectoryTree";
import { DirectoryViewTree } from "../DirectoryViewTree";
import { useLayoutStore } from "../useLayoutStore";

vi.mock("~/routes/favorites/useFavorite", () => ({
  useFavorite: () => ({ isFavorite: false, isPending: false, toggle: vi.fn() }),
}));

const mockNodes: TreeNode[] = [
  {
    id: "results/",
    connectionId: "aws-test-bucket",
    connectionName: "aws-test-bucket",
    type: "directory",
    name: "results",
    pathName: "results/",
    children: [
      {
        id: "results/output.ome.tif",
        connectionId: "aws-test-bucket",
        connectionName: "aws-test-bucket",
        type: "file",
        name: "output.ome.tif",
        pathName: "results/output.ome.tif",
        children: [],
      },
    ],
  },
  {
    id: "analysis.csv",
    connectionId: "aws-test-bucket",
    connectionName: "aws-test-bucket",
    type: "file",
    name: "analysis.csv",
    pathName: "analysis.csv",
    children: [],
  },
];

describe("DirectoryViewTree", () => {
  test("renders with tree role and aria-label", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => <DirectoryViewTree nodes={mockNodes} kind="entries" />,
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(screen.getByRole("tree", { name: /Directory tree/i })).toBeInTheDocument();
  });

  test("renders top-level node names", async () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => <DirectoryViewTree nodes={mockNodes} kind="entries" />,
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(await screen.findByText("results")).toBeInTheDocument();
    expect(await screen.findByText("analysis.csv")).toBeInTheDocument();
  });
});

describe("DirectoryViewTree — hidden files (global toggle)", () => {
  beforeEach(() => useLayoutStore.setState({ showHiddenFiles: false }));

  const hiddenNodes: TreeNode[] = [
    {
      id: "data/",
      connectionId: "aws-test-bucket",
      connectionName: "aws-test-bucket",
      type: "directory",
      name: "data",
      pathName: "data/",
      children: [
        {
          id: "data/slide.ome.tif",
          connectionId: "aws-test-bucket",
          connectionName: "aws-test-bucket",
          type: "file",
          name: "slide.ome.tif",
          pathName: "data/slide.ome.tif",
          children: [],
        },
        {
          id: "data/slide.ome.annotations.set-uuid.json",
          connectionId: "aws-test-bucket",
          connectionName: "aws-test-bucket",
          type: "file",
          name: "slide.ome.annotations.set-uuid.json",
          pathName: "data/slide.ome.annotations.set-uuid.json",
          children: [],
        },
        {
          id: "data/settings.u1.json",
          connectionId: "aws-test-bucket",
          connectionName: "aws-test-bucket",
          type: "file",
          name: "settings.u1.json",
          pathName: "data/settings.u1.json",
          children: [],
        },
        {
          id: "data/.DS_Store",
          connectionId: "aws-test-bucket",
          connectionName: "aws-test-bucket",
          type: "file",
          name: ".DS_Store",
          pathName: "data/.DS_Store",
          children: [],
        },
      ],
    },
  ];

  test("hides dot-files and sidecars at render when toggle is off", async () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <DirectoryViewTree nodes={hiddenNodes} kind="entries" defaultExpandedItems={["data/"]} />
        ),
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(await screen.findByText("slide.ome.tif")).toBeInTheDocument();
    expect(screen.queryByText("slide.ome.annotations.set-uuid.json")).toBeNull();
    expect(screen.queryByText("settings.u1.json")).toBeNull();
    expect(screen.queryByText(".DS_Store")).toBeNull();
  });

  test("reveals hidden files when toggle is on", async () => {
    useLayoutStore.setState({ showHiddenFiles: true });
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <DirectoryViewTree nodes={hiddenNodes} kind="entries" defaultExpandedItems={["data/"]} />
        ),
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(await screen.findByText("slide.ome.annotations.set-uuid.json")).toBeInTheDocument();
    expect(screen.getByText("settings.u1.json")).toBeInTheDocument();
    expect(screen.getByText(".DS_Store")).toBeInTheDocument();
  });

  test("hides sidecars inside lazily-loaded children (onExpand path)", async () => {
    const lazyParent: TreeNode[] = [
      {
        id: "data/",
        connectionId: "aws-test-bucket",
        connectionName: "aws-test-bucket",
        type: "directory",
        name: "data",
        pathName: "data/",
        children: [],
        loadState: "idle",
      },
    ];
    const onExpand = vi.fn(async (): Promise<TreeNode[]> => [
      {
        id: "data/slide.ome.tif",
        connectionId: "aws-test-bucket",
        connectionName: "aws-test-bucket",
        type: "file",
        name: "slide.ome.tif",
        pathName: "data/slide.ome.tif",
        children: [],
      },
      {
        id: "data/settings.u1.json",
        connectionId: "aws-test-bucket",
        connectionName: "aws-test-bucket",
        type: "file",
        name: "settings.u1.json",
        pathName: "data/settings.u1.json",
        children: [],
      },
    ]);

    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <DirectoryViewTree
            nodes={lazyParent}
            kind="entries"
            onExpand={onExpand}
            defaultExpandedItems={["data/"]}
          />
        ),
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(await screen.findByText("slide.ome.tif")).toBeInTheDocument();
    expect(screen.queryByText("settings.u1.json")).toBeNull();
  });
});
