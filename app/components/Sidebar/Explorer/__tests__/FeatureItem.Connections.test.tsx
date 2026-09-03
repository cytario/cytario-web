import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { FeatureItemConnections } from "../FeatureItem.Connections";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { useConnectionsStore, type Connection } from "~/utils/connectionsStore/useConnectionsStore";

vi.mock("~/routes/favorites/useFavorite", () => ({
  useFavorite: () => ({ isFavorite: false, isPending: false, toggle: vi.fn() }),
}));

const testConnection = {
  connectionConfig: { id: "test-conn", name: "Test Connection", grants: [] },
  credentials: null,
  status: "connected",
} as unknown as Connection;

function renderSidebar() {
  const RemixStub = createRoutesStub([{ path: "/", Component: () => <FeatureItemConnections /> }]);
  return render(<RemixStub initialEntries={["/"]} />);
}

describe("FeatureItemConnections — show hidden files toggle", () => {
  beforeEach(() => {
    useLayoutStore.setState({ showHiddenFiles: false });
    useConnectionsStore.setState({ connections: { "test-conn": testConnection } });
  });

  test("renders unpressed with the EyeOff icon by default", () => {
    renderSidebar();

    const toggle = screen.getByRole("button", { name: "Show hidden files" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle.querySelector("svg.lucide-eye-off")).toBeInTheDocument();
  });

  test("reflects a pressed state from the store", () => {
    useLayoutStore.setState({ showHiddenFiles: true });
    renderSidebar();

    const toggle = screen.getByRole("button", { name: "Show hidden files" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle.querySelector("svg.lucide-eye")).toBeInTheDocument();
  });

  test("clicking the toggle flips the store state and icon", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    renderSidebar();

    await user.click(screen.getByRole("button", { name: "Show hidden files" }));

    expect(useLayoutStore.getState().showHiddenFiles).toBe(true);

    const toggle = screen.getByRole("button", { name: "Show hidden files" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle.querySelector("svg.lucide-eye")).toBeInTheDocument();
  });

  test("still renders the view-all-connections action", () => {
    renderSidebar();

    expect(screen.getByRole("link", { name: "View all connections" })).toBeInTheDocument();
  });
});
