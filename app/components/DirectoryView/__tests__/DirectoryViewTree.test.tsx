import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { TreeNode } from "../buildDirectoryTree";
import { DirectoryViewTree, DirectoryTree } from "../DirectoryViewTree";

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
});

describe("DirectoryTree (lightweight)", () => {
  test("renders all nodes as links", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => <DirectoryTree nodes={mockNodes} />,
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(screen.getByText("results")).toBeInTheDocument();
    expect(screen.getByText("analysis.csv")).toBeInTheDocument();
  });

  test("renders nested children recursively", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => <DirectoryTree nodes={mockNodes} />,
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    expect(screen.getByText("output.ome.tif")).toBeInTheDocument();
  });

  test("renders correct navigation URLs", () => {
    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => <DirectoryTree nodes={mockNodes} />,
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    const csvLink = screen.getByText("analysis.csv").closest("a");
    expect(csvLink).toHaveAttribute(
      "href",
      "/connections/aws-test-bucket/analysis.csv",
    );
  });

  test("calls action callback when provided", async () => {
    const actionFn = vi.fn();
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    const RemixStub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <DirectoryTree nodes={mockNodes} action={actionFn} />
        ),
      },
    ]);

    render(<RemixStub initialEntries={["/"]} />);

    await user.click(screen.getByText("analysis.csv"));

    expect(actionFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: "analysis.csv" }),
    );
  });
});
