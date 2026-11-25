import { ToastProvider } from "@cytario/design";
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ConnectionTree } from "../ConnectionTree";
import mock from "~/utils/__tests__/__mocks__";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

vi.mock("~/routes/favorites/useFavorite", () => ({
  useFavorite: () => ({ isFavorite: false, isPending: false, toggle: vi.fn() }),
}));

// The expanded root would list the bucket for real; the tree's shape is all
// this test needs.
vi.mock("~/utils/loadConnectionLevel", () => ({
  loadConnectionLevel: vi.fn(async () => ({ nodes: [], error: false })),
}));

const renderTree = () => {
  const Stub = createRoutesStub([
    { path: "/:org?/*", Component: () => <ConnectionTree selectedConnection="conn-a" query="" /> },
  ]);
  return render(
    <ToastProvider>
      <Stub initialEntries={["/org1"]} />
    </ToastProvider>,
  );
};

describe("ConnectionTree — gate-locked connection", () => {
  beforeEach(() => {
    useConnectionsStore.setState({
      connections: {
        "conn-a": {
          connectionConfig: mock.connectionConfig({ id: "conn-a", name: "Conn A" }),
          credentials: mock.credentials(),
          status: "connected",
        },
      },
      lockedConnectionIds: [],
    });
  });

  test("an unlocked connection root is an expandable link", async () => {
    renderTree();

    expect(await screen.findByRole("link", { name: /Conn A/ })).toBeInTheDocument();
    // The root starts expanded (the route's active path is revealed).
    expect(
      screen.getByRole("button", { name: /Collapse Conn A|Expand Conn A/ }),
    ).toBeInTheDocument();
  });

  test("a locked connection root is neither a link nor expandable", async () => {
    useConnectionsStore.setState({ lockedConnectionIds: ["conn-a"] });

    renderTree();

    expect(await screen.findByText("Conn A")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Collapse Conn A|Expand Conn A/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });
});
