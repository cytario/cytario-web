import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { AppHeader } from "~/components/AppHeader";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";

vi.mock("~/components/UserMenu", () => ({
  UserMenu: () => createElement("button", { "data-testid": "user-menu" }, "User menu"),
}));

vi.mock("~/components/HelpMenu", () => ({
  HelpMenu: () => createElement("button", { "data-testid": "help-menu" }, "Help menu"),
}));

vi.mock("~/components/Breadcrumbs/Breadcrumbs", () => ({
  Breadcrumbs: () => createElement("nav", { "data-testid": "breadcrumbs" }),
}));

vi.mock("~/components/Sidebar/Explorer/ExplorerSidebarToggle", () => ({
  ExplorerSidebarToggle: () => createElement("button", { "data-testid": "explorer-toggle" }, "Nav"),
}));

const rootLoaderData = {
  user: {
    sub: "u1",
    given_name: "Ada",
    family_name: "Lovelace",
    email: "ada@example.com",
    groups: [],
    adminScopes: [],
  },
  accountSettingsUrl: "https://auth.example.com/account",
  version: "1.2.3",
};

function renderHeader() {
  const Stub = createRoutesStub([
    {
      id: "root",
      path: "/",
      loader: () => rootLoaderData,
      Component: () => createElement(AppHeader),
    },
  ]);
  return render(createElement(Stub, { initialEntries: ["/"] }));
}

describe("AppHeader", () => {
  beforeEach(() => {
    useLayoutStore.setState({ headerSlot: null });
  });

  test("renders no slot content when the header slot is empty", async () => {
    renderHeader();
    expect(await screen.findByTestId("user-menu")).toBeVisible();
    expect(screen.queryByTestId("header-slot-probe")).toBeNull();
  });

  test("renders the header slot immediately left of the user and help menus", async () => {
    useLayoutStore.setState({
      headerSlot: createElement("button", { "data-testid": "header-slot-probe" }, "Toggle"),
    });

    renderHeader();
    const probe = await screen.findByTestId("header-slot-probe");
    const userMenu = screen.getByTestId("user-menu");
    const helpMenu = screen.getByTestId("help-menu");

    // DOCUMENT_POSITION_FOLLOWING: the menus follow the slot in reading order.
    expect(probe.compareDocumentPosition(userMenu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(probe.compareDocumentPosition(helpMenu) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
