import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, test, vi } from "vitest";

import type { UserProfile } from "~/.server/auth/getUserInfo";
import { UserMenu } from "~/components/UserMenu";
import { ORG_ROOT_SCOPE } from "~/utils/authorization";

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

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    sub: "sub-1",
    email: "user@example.com",
    email_verified: true,
    name: "Test User",
    preferred_username: "test.user",
    given_name: "Test",
    family_name: "User",
    policy: [],
    groups: [],
    adminScopes: [],
    organizationAttributes: {},
    ...overrides,
  };
}

const accountSettingsUrl = "https://auth.example.com/account";

describe("UserMenu — Admin Portal entry", () => {
  test("renders Admin Portal link for an org-root admin when portalUrl is set", () => {
    render(
      <UserMenu
        user={makeUser({ adminScopes: [ORG_ROOT_SCOPE] })}
        accountSettingsUrl={accountSettingsUrl}
        portalUrl="https://admin.example.com/portal"
      />,
    );

    const link = screen.getByTestId("menu-item-admin-portal");
    expect(link).toHaveAttribute("href", "https://admin.example.com/portal");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveTextContent("Admin Portal");
  });

  test("renders nothing for an org-root admin when portalUrl is unset", () => {
    render(
      <UserMenu
        user={makeUser({ adminScopes: [ORG_ROOT_SCOPE] })}
        accountSettingsUrl={accountSettingsUrl}
      />,
    );

    expect(screen.queryByTestId("menu-item-admin-portal")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin Portal")).not.toBeInTheDocument();
  });

  test("renders nothing for a non-org-root admin when portalUrl is set", () => {
    render(
      <UserMenu
        user={makeUser({ adminScopes: ["Lab"] })}
        accountSettingsUrl={accountSettingsUrl}
        portalUrl="https://admin.example.com/portal"
      />,
    );

    expect(screen.queryByTestId("menu-item-admin-portal")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin Portal")).not.toBeInTheDocument();
  });

  test("renders nothing for a regular non-admin user when portalUrl is set", () => {
    render(
      <UserMenu
        user={makeUser({ adminScopes: [] })}
        accountSettingsUrl={accountSettingsUrl}
        portalUrl="https://admin.example.com/portal"
      />,
    );

    expect(screen.queryByTestId("menu-item-admin-portal")).not.toBeInTheDocument();
    expect(screen.queryByText("Admin Portal")).not.toBeInTheDocument();
  });
});
