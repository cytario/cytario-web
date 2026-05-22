import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { TreeNode } from "../buildDirectoryTree";
import { DirectoryViewTree } from "../DirectoryViewTree";

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
