import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";

import AdminUsersRoute from "../users.route";
import { type GroupInfo, type UserWithGroups } from "~/.server/auth/keycloakAdmin";

const mockUsers: UserWithGroups[] = [
  {
    user: {
      id: "u1",
      username: "jdoe",
      email: "jane@example.com",
      firstName: "Jane",
      lastName: "Doe",
      enabled: true,
    },
    groupPaths: new Set(["cytario/lab", "cytario/lab/team-a"]),
    adminScopes: new Set(),
  },
  {
    user: {
      id: "u2",
      username: "mweber",
      email: "marcus@example.com",
      firstName: "Marcus",
      lastName: "Weber",
      enabled: false,
    },
    groupPaths: new Set(["cytario/lab", "cytario/lab/admins"]),
    adminScopes: new Set(["cytario/lab"]),
  },
];

const mockGroups: GroupInfo[] = [
  { id: "g1", path: "cytario/lab", name: "lab", isAdmin: false },
  { id: "g2", path: "cytario/lab/team-a", name: "team-a", isAdmin: false },
  { id: "g3", path: "cytario/lab/admins", name: "admins", isAdmin: true },
];

describe("AdminUsersRoute", () => {
  function renderRoute(users = mockUsers, groups = mockGroups) {
    const RemixStub = createRoutesStub([
      {
        path: "/admin/users",
        Component: AdminUsersRoute,
        loader: () => ({
          scope: "cytario/lab",
          users,
          groups,
        }),
      },
    ]);

    return render(
      <RemixStub initialEntries={["/admin/users?scope=cytario/lab"]} />,
    );
  }

  test("renders table with visible column headers", async () => {
    renderRoute();

    // Visible by default
    expect(await screen.findByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Admin Groups")).toBeInTheDocument();
    expect(screen.getByText("Groups")).toBeInTheDocument();

    // ID is hidden by default
    expect(screen.queryByText("ID")).not.toBeInTheDocument();
  });

  test("renders user data in table rows", async () => {
    renderRoute();

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Marcus Weber")).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("marcus@example.com")).toBeInTheDocument();
  });

  test("renders Active/Disabled status badges", async () => {
    renderRoute();

    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  test("renders Invite User button", async () => {
    renderRoute();

    // ButtonLink renders twice (once above table, accessible as link)
    const inviteLinks = await screen.findAllByText("Invite User");
    expect(inviteLinks.length).toBeGreaterThanOrEqual(1);
  });

  test("renders empty state when no users", async () => {
    renderRoute([], mockGroups);

    expect(await screen.findByText("No users yet")).toBeInTheDocument();
    expect(
      screen.getByText("Invite team members to get started."),
    ).toBeInTheDocument();
  });

  test("renders group pills for user memberships", async () => {
    renderRoute();

    // Jane is in team-a (non-admin), Marcus is in admins
    // "team-a" appears as pill text, "admins" appears as pill text
    expect(await screen.findByText("team-a")).toBeInTheDocument();
  });

  test("separates admin groups and regular groups in data", async () => {
    renderRoute();

    // Marcus is in "cytario/lab/admins" — should appear in Admin Groups column
    // The "admins" text should appear as a visible GroupPill segment
    expect(await screen.findByText("admins")).toBeInTheDocument();
  });
});
