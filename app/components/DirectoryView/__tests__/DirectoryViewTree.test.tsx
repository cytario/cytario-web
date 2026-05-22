import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { TreeNode } from "../buildDirectoryTree";
import { DirectoryViewTree } from "../DirectoryViewTree";

// Mock react-arborist to avoid JSDOM rendering issues with virtual lists
vi.mock("react-arborist", () => ({
  Tree: ({ data }: { data: Array<{ id: string; name: string }> }) => (
    <div data-testid="arborist-tree">
      {data.map((node) => (
        <div key={node.id} data-testid="tree-node">
          {node.name}
        </div>
      ))}
    </div>
  ),
}));

const mockNodes: TreeNode[] = [
  {
    id: "results/",
    connectionName: "aws-test-bucket",
    type: "directory",
    name: "results",

    pathName: "results/",

    children: [
      {
        id: "results/output.ome.tif",
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
        Component: () => (
          <DirectoryViewTree nodes={mockNodes} kind="entries" onExpand={async () => []} />
        ),
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(screen.getByRole("tree", { name: /Directory tree/i })).toBeInTheDocument();
  });

  test("renders top-level node names via arborist", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <DirectoryViewTree nodes={mockNodes} kind="entries" onExpand={async () => []} />
        ),
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(screen.getByText("results")).toBeInTheDocument();
    expect(screen.getByText("analysis.csv")).toBeInTheDocument();
  });
});
