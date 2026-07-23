import { render } from "@testing-library/react";
import { MemoryRouter, useMatches } from "react-router";
import { Mock } from "vitest";

import { type TreeNode } from "../../DirectoryView/buildDirectoryTree";
import { Breadcrumbs } from "../Breadcrumbs";

const renderBreadcrumbs = () =>
  render(
    <MemoryRouter>
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
  NodeLink: ({ node, contextMenu }: { node: TreeNode; contextMenu?: boolean }) => (
    <span data-menu={contextMenu ? "true" : "false"}>{node.name}</span>
  ),
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
  test("renders a crumb per node, splitting connection paths into ancestors", () => {
    (useMatches as Mock).mockReturnValue([
      { pathname: "/connections", handle: { node: () => staticNode("Connections") } },
      {
        pathname: "/connections/bucket/a/b",
        handle: { node: () => connectionNode("bucket", "a/b", "b") },
      },
    ]);

    const { getByText } = renderBreadcrumbs();

    // Connections (static) + bucket → a → b (split from "a/b").
    ["Connections", "bucket", "a", "b"].forEach((label) =>
      expect(getByText(label)).toBeInTheDocument(),
    );
  });

  test("only the leaf crumb gets a context menu", () => {
    (useMatches as Mock).mockReturnValue([
      {
        pathname: "/connections/bucket/a/b",
        handle: { node: () => connectionNode("bucket", "a/b", "b") },
      },
    ]);

    const { getByText } = renderBreadcrumbs();

    expect(getByText("b").getAttribute("data-menu")).toBe("true");
    expect(getByText("bucket").getAttribute("data-menu")).toBe("false");
    expect(getByText("a").getAttribute("data-menu")).toBe("false");
  });

  test("renders only the Logo when no match carries a node handle", () => {
    (useMatches as Mock).mockReturnValue([{}, { handle: {} }]);

    const { getByText, container } = renderBreadcrumbs();

    expect(getByText("Logo")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-menu]")).toHaveLength(0);
  });
});
