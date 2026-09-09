import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import type { Mock } from "vitest";

import { PluginNavSection } from "../PluginNavSection";
import { usePluginNavEntries } from "../usePluginNavEntries";
import type { SidebarNavEntry } from "@cytario/plugin-api";

vi.mock("../usePluginNavEntries", () => ({
  usePluginNavEntries: vi.fn(),
}));

const entry = {
  id: "jobs",
  label: "Jobs",
  icon: "Layers",
  to: "/plugins/jobs",
} as SidebarNavEntry;

function renderSection() {
  const Stub = createRoutesStub([{ path: "/", Component: () => <PluginNavSection /> }]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("PluginNavSection", () => {
  beforeEach(() => {
    (usePluginNavEntries as Mock).mockReturnValue([{ entry, activationContext: {} }]);
  });

  test("renders each visible entry as a header-row link with the entry's icon and label", () => {
    renderSection();

    const link = screen.getByRole("link", { name: /Jobs/ });
    expect(link).toHaveAttribute("href", "/plugins/jobs");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("renders nothing when the registry is empty", () => {
    (usePluginNavEntries as Mock).mockReturnValue([]);
    const { container } = renderSection();
    expect(container).toBeEmptyDOMElement();
  });
});
