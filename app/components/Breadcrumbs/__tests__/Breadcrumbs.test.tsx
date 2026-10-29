import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useMatches } from "react-router";
import { Mock } from "vitest";

import { type TreeNode } from "../../DirectoryView/buildDirectoryTree";
import { Breadcrumbs } from "../Breadcrumbs";

interface TestUser {
  organization?: string;
  organizations?: Record<string, { groups: readonly string[] }>;
}

let currentUser: TestUser | undefined;

vi.mock("~/hooks/useCurrentUser", () => ({
  useCurrentUser: () => currentUser,
}));

const renderBreadcrumbs = () =>
  render(
    <MemoryRouter initialEntries={["/o/acme/connections/bucket/a/b"]}>
      <Breadcrumbs />
    </MemoryRouter>,
  );

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, useMatches: vi.fn(() => []) };
});

vi.mock("@cytario/design", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cytario/design")>();
  return { ...actual, Logo: () => <span>Logo</span> };
});

// Stand-in so the test exercises trail-building, not NodeLink's router/store deps.
vi.mock("../../DirectoryView/NodeLink/NodeLink", () => ({
  NodeLink: ({ node }: { node: TreeNode }) => <span data-menu="true">{node.name}</span>,
}));

const staticNode = (name: string): TreeNode => ({
  id: `virtual/${name}`,
  connectionId: "",
  connectionName: "",
  pathName: "",
  name,
  type: "directory",
  children: [],
});

const connectionNode = (connectionName: string, pathName: string, name: string): TreeNode => ({
  id: `${connectionName}/${pathName}`,
  connectionId: connectionName,
  connectionName,
  pathName,
  name,
  type: "directory",
  children: [],
});

describe("Breadcrumbs", () => {
  beforeEach(() => {
    currentUser = { organization: "acme", organizations: { acme: { groups: [] } } };
  });

  test("renders a crumb per node, splitting connection paths into ancestors", () => {
    (useMatches as Mock).mockReturnValue([
      { pathname: "/o/acme/connections", handle: { node: () => staticNode("Connections") } },
      {
        pathname: "/o/acme/connections/bucket/a/b",
        handle: { node: () => connectionNode("bucket", "a/b", "b") },
      },
    ]);

    renderBreadcrumbs();

    // Connections (static) + bucket → a → b (split from "a/b").
    ["Connections", "bucket", "a", "b"].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  test("every crumb gets a context menu", () => {
    (useMatches as Mock).mockReturnValue([
      {
        pathname: "/o/acme/connections/bucket/a/b",
        handle: { node: () => connectionNode("bucket", "a/b", "b") },
      },
    ]);

    renderBreadcrumbs();

    expect(screen.getByText("b").getAttribute("data-menu")).toBe("true");
    expect(screen.getByText("bucket").getAttribute("data-menu")).toBe("true");
    expect(screen.getByText("a").getAttribute("data-menu")).toBe("true");
  });

  test("renders only the Logo when no match carries a node handle", () => {
    (useMatches as Mock).mockReturnValue([{}, { handle: {} }]);

    const { container } = renderBreadcrumbs();

    expect(screen.getByText("Logo")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-menu]")).toHaveLength(0);
  });

  test("links the logo to the active organization's home", () => {
    (useMatches as Mock).mockReturnValue([]);

    renderBreadcrumbs();

    expect(screen.getByRole("link", { name: "Go to home" })).toHaveAttribute("href", "/o/acme");
  });

  test("names a single organization as the root crumb without a switcher", () => {
    (useMatches as Mock).mockReturnValue([]);

    renderBreadcrumbs();

    expect(screen.getByText("acme")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch organization" })).not.toBeInTheDocument();
  });

  test("offers the other memberships in a switcher for a multi-org user", async () => {
    currentUser = {
      organization: "acme",
      organizations: { acme: { groups: [] }, beta: { groups: [] } },
    };
    (useMatches as Mock).mockReturnValue([]);

    renderBreadcrumbs();
    await userEvent.click(screen.getByRole("button", { name: "Switch organization" }));

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["acme", "beta"]);
  });

  test("a switcher entry keeps the current sub-path in the chosen organization", async () => {
    currentUser = {
      organization: "acme",
      organizations: { acme: { groups: [] }, beta: { groups: [] } },
    };
    (useMatches as Mock).mockReturnValue([]);

    renderBreadcrumbs();
    await userEvent.click(screen.getByRole("button", { name: "Switch organization" }));

    // Menu items render as links, so the switch is a real navigation the org
    // layout's middleware then reconciles into a session change.
    expect(await screen.findByRole("menuitem", { name: "beta" })).toHaveAttribute(
      "href",
      "/o/beta/connections/bucket/a/b",
    );
    expect(screen.getByRole("menuitem", { name: "acme" })).toHaveAttribute(
      "href",
      "/o/acme/connections/bucket/a/b",
    );
  });
});
