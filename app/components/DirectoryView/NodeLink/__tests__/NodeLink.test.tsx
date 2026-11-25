import { ToastProvider } from "@cytario/design";
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { NodeLink } from "../NodeLink";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import mock from "~/utils/__tests__/__mocks__";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

vi.mock("~/routes/favorites/useFavorite", () => ({
  useFavorite: () => ({ isFavorite: false, isPending: false, toggle: vi.fn() }),
}));

const bucketNode = (overrides: Partial<TreeNode> = {}): TreeNode => ({
  id: "conn-a/",
  connectionId: "conn-a",
  connectionName: "Conn A",
  type: "bucket",
  name: "Conn A",
  pathName: "",
  children: [],
  ...overrides,
});

const renderNode = (node: TreeNode) => {
  useConnectionsStore.setState({
    connections: {
      "conn-a": {
        connectionConfig: mock.connectionConfig({ id: "conn-a", name: "Conn A" }),
        credentials: mock.credentials(),
        status: "connected",
      },
    },
    lockedConnectionIds: node.isLocked ? ["conn-a"] : [],
  });

  const Stub = createRoutesStub([{ path: "/:org?/*", Component: () => <NodeLink node={node} /> }]);
  return render(
    <ToastProvider>
      <Stub initialEntries={["/org1"]} />
    </ToastProvider>,
  );
};

describe("NodeLink — gate-locked connection", () => {
  test("an unlocked bucket node is a link", () => {
    renderNode(bucketNode());

    expect(screen.getByRole("link", { name: /Conn A/ })).toBeInTheDocument();
    expect(screen.queryByText("Locked")).not.toBeInTheDocument();
  });

  test("a locked bucket node is not a link and carries the upgrade note", () => {
    renderNode(bucketNode({ isLocked: true }));

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Conn A")).toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
    // The note is the trigger's accessible name too, not hover-only text.
    expect(screen.getByLabelText("Upgrade plan to browse")).toBeInTheDocument();
  });

  test("a locked node keeps its actions menu so delete stays reachable", () => {
    renderNode(bucketNode({ isLocked: true }));

    expect(screen.getByRole("button", { name: "Actions for Conn A" })).toBeInTheDocument();
  });
});
