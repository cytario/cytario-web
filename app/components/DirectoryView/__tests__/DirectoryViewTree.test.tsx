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
    connectionName: "aws-test-bucket",
    type: "directory",
    name: "results",
    bucketName: "test-bucket",
    pathName: "results/",
    provider: "aws",
    children: [
      {
        connectionName: "aws-test-bucket",
        type: "file",
        name: "output.ome.tif",
        bucketName: "test-bucket",
        pathName: "results/output.ome.tif",
        provider: "aws",
        children: [],
      },
    ],
  },
  {
    connectionName: "aws-test-bucket",
    type: "file",
    name: "analysis.csv",
    bucketName: "test-bucket",
    pathName: "analysis.csv",
    provider: "aws",
    children: [],
  },
];

describe("DirectoryViewTree", () => {
  test("renders with tree role and aria-label", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => <DirectoryViewTree nodes={mockNodes} />,
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(
      screen.getByRole("tree", { name: /Directory tree/i }),
    ).toBeInTheDocument();
  });

  test("renders top-level node names via arborist", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => <DirectoryViewTree nodes={mockNodes} />,
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(screen.getByText("results")).toBeInTheDocument();
    expect(screen.getByText("analysis.csv")).toBeInTheDocument();
  });

  test("renders with autoHeight and compact size", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <DirectoryViewTree nodes={mockNodes} autoHeight size="compact" />
        ),
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(screen.getByText("results")).toBeInTheDocument();
    expect(screen.getByText("analysis.csv")).toBeInTheDocument();
  });
});
