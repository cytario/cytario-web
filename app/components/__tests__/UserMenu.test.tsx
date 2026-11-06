import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { UserMenu } from "~/components/UserMenu";
import type { ClientUser } from "~/root";
import { ORG_ROOT_SCOPE } from "~/utils/authorization";

// UserMenu resolves the URL's org (useActiveOrg) with a pointer fallback via
// useCurrentUser; the root-loader read needs a data router, so mock it.
vi.mock("~/hooks/useCurrentUser", () => ({
  useCurrentUser: vi.fn(() => undefined),
}));

vi.mock("@cytario/design", async () => {
  const actual = await vi.importActual<typeof import("@cytario/design")>("@cytario/design");
  return {
    ...actual,
    Menu: ({ content }: { content: React.ReactNode }) =>
      createElement("div", { "data-testid": "menu-content" }, content),
    MenuSection: ({ header, children }: { header?: React.ReactNode; children: React.ReactNode }) =>
      createElement("section", null, createElement("div", null, header), children),
    MenuHeader: ({ children }: { children: React.ReactNode }) =>
      createElement("div", null, children),
    MenuSeparator: () => createElement("hr", null),
    MenuItem: ({
      id,
      href,
      target,
      children,
    }: {
      id: string;
      href?: string;
      target?: string;
      children: React.ReactNode;
    }) => {
      if (href) {
        return createElement("a", { id, href, target, "data-testid": `menu-item-${id}` }, children);
      }
      return createElement("div", { id, "data-testid": `menu-item-${id}` }, children);
    },
  };
});

/** The root loader's client payload shape — request-org entitlements derived. */
function makeUser(overrides: Partial<ClientUser> = {}): ClientUser {
  return {
    sub: "sub-1",
    email: "user@example.com",
    email_verified: true,
    name: "Test User",
    preferred_username: "test.user",
    given_name: "Test",
    family_name: "User",
    policy: [],
    organizations: {},
    groups: [],
    adminScopes: [],
    organizationAttributes: {},
    ...overrides,
  };
}

const accountSettingsUrl = "https://auth.example.com/account";

/** UserMenu reads the URL's org segment, so it renders inside a router. */
function renderUserMenu(props: { user: ClientUser; portalUrl?: string }) {
  return render(
    <MemoryRouter initialEntries={["/org1/"]}>
      <UserMenu
        user={props.user}
        accountSettingsUrl={accountSettingsUrl}
        portalUrl={props.portalUrl}
      />
    </MemoryRouter>,
  );
}

describe("UserMenu — Admin Portal entry", () => {
  test("renders Admin Portal link for an org-root admin when portalUrl is set", () => {
    renderUserMenu({
      user: makeUser({ adminScopes: [ORG_ROOT_SCOPE] }),
      portalUrl: "https://admin.example.com/portal",
    });

    const link = screen.getByTestId("menu-item-admin-portal");
    expect(link).toHaveAttribute("href", "https://admin.example.com/portal");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveTextContent("Admin Portal");
  });

  test("renders nothing for an org-root admin when portalUrl is unset", () => {
    renderUserMenu({ user: makeUser({ adminScopes: [ORG_ROOT_SCOPE] }) });

    expect(screen.queryByTestId("menu-item-admin-portal")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin Portal")).not.toBeInTheDocument();
  });

  test("renders nothing for a non-org-root admin when portalUrl is set", () => {
    renderUserMenu({
      user: makeUser({ adminScopes: ["Lab"] }),
      portalUrl: "https://admin.example.com/portal",
    });

    expect(screen.queryByTestId("menu-item-admin-portal")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin Portal")).not.toBeInTheDocument();
  });

  test("renders nothing for a regular non-admin user when portalUrl is set", () => {
    renderUserMenu({
      user: makeUser({ adminScopes: [] }),
      portalUrl: "https://admin.example.com/portal",
    });

    expect(screen.queryByTestId("menu-item-admin-portal")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin Portal")).not.toBeInTheDocument();
  });
});
