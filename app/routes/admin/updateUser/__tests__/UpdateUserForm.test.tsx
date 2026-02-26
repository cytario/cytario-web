import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, test } from "vitest";

import { UpdateUserForm } from "../updateUser.form";
import { type GroupInfo } from "~/.server/auth/keycloakAdmin";
import { type KeycloakUser } from "~/.server/auth/keycloakAdmin/client";

const mockUser: KeycloakUser = {
  id: "user-1",
  username: "jdoe",
  email: "jane@example.com",
  firstName: "Jane",
  lastName: "Doe",
  enabled: true,
};

const mockGroups: GroupInfo[] = [
  { id: "g1", path: "cytario/lab", name: "lab", isAdmin: false },
  { id: "g2", path: "cytario/lab/team-a", name: "team-a", isAdmin: false },
  { id: "g3", path: "cytario/lab/admins", name: "admins", isAdmin: true },
];

function renderForm(
  overrides: {
    user?: Partial<KeycloakUser>;
    groups?: GroupInfo[];
    groupPaths?: Set<string>;
  } = {},
) {
  const user = { ...mockUser, ...overrides.user };
  const groups = overrides.groups ?? mockGroups;
  const groupPaths = overrides.groupPaths ?? new Set(["cytario/lab"]);

  const RemixStub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <UpdateUserForm user={user} groups={groups} groupPaths={groupPaths} />
      ),
      action: () => null,
    },
  ]);

  return render(<RemixStub initialEntries={["/"]} />);
}

describe("UpdateUserForm", () => {
  describe("field order", () => {
    test("renders Email before First name before Last name before Enabled", () => {
      renderForm();

      const labels = screen
        .getAllByText(/^(Email|First name|Last name|Enabled)$/)
        .map((el) => el.textContent);

      expect(labels).toEqual(["Email", "First name", "Last name", "Enabled"]);
    });
  });

  describe("group sections", () => {
    test("renders Group Membership section for non-admin groups", () => {
      renderForm();

      expect(screen.getByText("Group Membership")).toBeInTheDocument();
      expect(screen.getByText("cytario/lab")).toBeInTheDocument();
      expect(screen.getByText("cytario/lab/team-a")).toBeInTheDocument();
    });

    test("renders Admin Groups section for admin groups", () => {
      renderForm();

      expect(screen.getByText("Admin Groups")).toBeInTheDocument();
      expect(screen.getByText("cytario/lab/admins")).toBeInTheDocument();
    });

    test("hides Admin Groups section when no admin groups exist", () => {
      renderForm({
        groups: mockGroups.filter((g) => !g.isAdmin),
      });

      expect(screen.queryByText("Admin Groups")).not.toBeInTheDocument();
    });
  });

  describe("destructive change confirmation", () => {
    test("warns when disabling an enabled account", async () => {
      renderForm();

      // Checkboxes: [Enabled, lab(checked), team-a, admins]
      const checkboxes = screen.getAllByRole("checkbox");
      fireEvent.click(checkboxes[0]); // Uncheck Enabled

      // Submit
      const form = document.getElementById("update-form") as HTMLFormElement;
      fireEvent.submit(form);

      expect(
        await screen.findByText("Confirm Changes"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Disable account for Jane Doe"),
      ).toBeInTheDocument();
    });

    test("warns when granting admin access", async () => {
      renderForm({ groupPaths: new Set(["cytario/lab"]) });

      // Checkboxes: [Enabled, lab(checked), team-a, admins]
      const checkboxes = screen.getAllByRole("checkbox");
      fireEvent.click(checkboxes[3]); // Check admins

      const form = document.getElementById("update-form") as HTMLFormElement;
      fireEvent.submit(form);

      expect(
        await screen.findByText("Confirm Changes"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Grant admin access: cytario/lab/admins"),
      ).toBeInTheDocument();
    });

    test("warns when revoking admin access", async () => {
      renderForm({
        groupPaths: new Set(["cytario/lab", "cytario/lab/admins"]),
      });

      // Checkboxes: [Enabled, lab(checked), team-a, admins(checked)]
      const checkboxes = screen.getAllByRole("checkbox");
      fireEvent.click(checkboxes[3]); // Uncheck admins

      const form = document.getElementById("update-form") as HTMLFormElement;
      fireEvent.submit(form);

      expect(
        await screen.findByText("Confirm Changes"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Revoke admin access: cytario/lab/admins"),
      ).toBeInTheDocument();
    });

    test("warns when removing from regular groups", async () => {
      renderForm({ groupPaths: new Set(["cytario/lab"]) });

      // Checkboxes: [Enabled, lab(checked), team-a, admins]
      const checkboxes = screen.getAllByRole("checkbox");
      fireEvent.click(checkboxes[1]); // Uncheck lab

      const form = document.getElementById("update-form") as HTMLFormElement;
      fireEvent.submit(form);

      expect(
        await screen.findByText("Confirm Changes"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Remove from groups: cytario/lab"),
      ).toBeInTheDocument();
    });

    test("submits without confirmation when only adding regular groups", async () => {
      renderForm({ groupPaths: new Set(["cytario/lab"]) });

      // Check team-a (adding, not removing)
      const checkboxes = screen.getAllByRole("checkbox");
      fireEvent.click(checkboxes[2]); // Check team-a

      const form = document.getElementById("update-form") as HTMLFormElement;
      fireEvent.submit(form);

      // Should NOT show confirmation
      await waitFor(() => {
        expect(
          screen.queryByText("Confirm Changes"),
        ).not.toBeInTheDocument();
      });
    });
  });
});
