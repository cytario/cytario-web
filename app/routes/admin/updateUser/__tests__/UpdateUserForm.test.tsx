import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  { id: "g1", path: "cytario/lab", name: "lab" },
  { id: "g2", path: "cytario/lab/team-a", name: "team-a" },
  { id: "g3", path: "cytario/lab/admins", name: "admins" },
];

let submitted: FormData | null = null;

function submittedEntries(): [string, string][] {
  return submitted
    ? Array.from(submitted.entries()).map(([key, value]) => [key, String(value)])
    : [];
}

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
      Component: () => <UpdateUserForm user={user} groups={groups} groupPaths={groupPaths} />,
      action: async ({ request }) => {
        submitted = await request.formData();
        return null;
      },
    },
  ]);

  submitted = null;
  return render(<RemixStub initialEntries={["/"]} />);
}

function selectedGroupTags(): string[] {
  const tagGroup = screen.queryByRole("grid", { name: "Groups selected", hidden: true });
  if (!tagGroup) return [];
  return within(tagGroup)
    .queryAllByRole("row", { hidden: true })
    .map((row) => row.dataset.key ?? "");
}

async function openGroupOptions(user: ReturnType<typeof userEvent.setup>) {
  const combobox = screen.getByRole("combobox", { name: "Groups" });
  await user.click(combobox);
  await user.keyboard("[ArrowDown]");
  return screen.findByRole("listbox");
}

async function pickGroup(user: ReturnType<typeof userEvent.setup>, path: string) {
  const listbox = await openGroupOptions(user);
  await user.click(within(listbox).getByRole("option", { name: path }));
}

function submitForm() {
  fireEvent.submit(document.getElementById("update-form") as HTMLFormElement);
}

describe("UpdateUserForm", () => {
  describe("field order", () => {
    test("renders Email before First name before Last name before Enabled", () => {
      renderForm();

      const labels = screen
        .getAllByText(/^(Email|First name|Last name|Enabled)$/)
        .map((element) => element.textContent);

      expect(labels).toEqual(["Email", "First name", "Last name", "Enabled"]);
    });
  });

  describe("group membership combobox", () => {
    test("offers every group as an option, labelled Groups", async () => {
      const user = userEvent.setup();
      renderForm();

      const listbox = await openGroupOptions(user);

      expect(
        within(listbox)
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["cytario/lab", "cytario/lab/team-a", "cytario/lab/admins"]);
    });

    test("renders the member groups as selected tags", async () => {
      renderForm({ groupPaths: new Set(["cytario/lab", "cytario/lab/admins"]) });

      await waitFor(() => expect(selectedGroupTags()).toEqual(["g1", "g3"]));
      expect(screen.getByRole("row", { name: "cytario/lab", hidden: true })).toBeInTheDocument();
      expect(
        screen.getByRole("row", { name: "cytario/lab/admins", hidden: true }),
      ).toBeInTheDocument();
    });

    test("filters out the ORG_ROOT_SCOPE sentinel group", async () => {
      const user = userEvent.setup();
      renderForm({
        groups: [{ id: "g-root", path: "*", name: "*" }, ...mockGroups],
      });

      const listbox = await openGroupOptions(user);

      expect(
        within(listbox)
          .getAllByRole("option")
          .map((option) => option.textContent),
      ).toEqual(["cytario/lab", "cytario/lab/team-a", "cytario/lab/admins"]);
    });

    test("selecting a group submits an add-group entry", async () => {
      const user = userEvent.setup();
      renderForm({ groupPaths: new Set(["cytario/lab"]) });

      await pickGroup(user, "cytario/lab/team-a");
      await waitFor(() => expect(selectedGroupTags()).toEqual(["g1", "g2"]));

      submitForm();

      await waitFor(() => expect(submittedEntries()).toContainEqual(["add-group-g2", "true"]));
      expect(submittedEntries()).not.toContainEqual(["add-group-g1", "true"]);
      expect(submittedEntries()).not.toContainEqual(["remove-group-g1", "true"]);
      expect(screen.queryByText("Confirm Changes")).not.toBeInTheDocument();
    });

    test("deselecting a group submits a remove-group entry", async () => {
      const user = userEvent.setup();
      renderForm({ groupPaths: new Set(["cytario/lab"]) });

      await pickGroup(user, "cytario/lab");
      await waitFor(() => expect(selectedGroupTags()).toEqual([]));

      submitForm();

      expect(await screen.findByText("Confirm Changes")).toBeInTheDocument();
      expect(screen.getByText("Remove from groups: cytario/lab")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

      await waitFor(() => expect(submittedEntries()).toContainEqual(["remove-group-g1", "true"]));
    });
  });

  describe("destructive change confirmation", () => {
    test("warns when disabling an enabled account", async () => {
      renderForm();

      // Checkboxes: the only one left is Enabled, now that groups are a combobox.
      const checkboxes = screen.getAllByRole("checkbox");
      fireEvent.click(checkboxes[0]); // Uncheck Enabled

      submitForm();

      expect(await screen.findByText("Confirm Changes")).toBeInTheDocument();
      expect(screen.getByText("Disable account for Jane Doe")).toBeInTheDocument();
    });

    test("warns when granting admin access", async () => {
      const user = userEvent.setup();
      renderForm({ groupPaths: new Set(["cytario/lab"]) });

      await pickGroup(user, "cytario/lab/admins");
      await waitFor(() => expect(selectedGroupTags()).toEqual(["g1", "g3"]));

      submitForm();

      expect(await screen.findByText("Confirm Changes")).toBeInTheDocument();
      expect(screen.getByText("Grant admin access: cytario/lab/admins")).toBeInTheDocument();
    });

    test("warns when revoking admin access", async () => {
      const user = userEvent.setup();
      renderForm({ groupPaths: new Set(["cytario/lab", "cytario/lab/admins"]) });

      await pickGroup(user, "cytario/lab/admins");
      await waitFor(() => expect(selectedGroupTags()).toEqual(["g1"]));

      submitForm();

      expect(await screen.findByText("Confirm Changes")).toBeInTheDocument();
      expect(screen.getByText("Revoke admin access: cytario/lab/admins")).toBeInTheDocument();
    });

    test("warns when removing from regular groups", async () => {
      const user = userEvent.setup();
      renderForm({ groupPaths: new Set(["cytario/lab"]) });

      await pickGroup(user, "cytario/lab");
      await waitFor(() => expect(selectedGroupTags()).toEqual([]));

      submitForm();

      expect(await screen.findByText("Confirm Changes")).toBeInTheDocument();
      expect(screen.getByText("Remove from groups: cytario/lab")).toBeInTheDocument();
    });

    test("submits without confirmation when only adding regular groups", async () => {
      const user = userEvent.setup();
      renderForm({ groupPaths: new Set(["cytario/lab"]) });

      await pickGroup(user, "cytario/lab/team-a");
      await waitFor(() => expect(selectedGroupTags()).toEqual(["g1", "g2"]));

      submitForm();

      await waitFor(() => expect(submittedEntries()).toContainEqual(["add-group-g2", "true"]));
      expect(screen.queryByText("Confirm Changes")).not.toBeInTheDocument();
    });
  });
});
