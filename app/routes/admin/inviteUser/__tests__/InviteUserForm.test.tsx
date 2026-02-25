import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { InviteUserForm } from "../inviteUser.form";

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useSubmit: () => vi.fn() };
});

function renderForm(
  overrides: { groupOptions?: string[]; scope?: string } = {},
) {
  const scope = overrides.scope ?? "cytario/lab";
  const groupOptions = overrides.groupOptions ?? [
    "cytario/lab",
    "cytario/lab/team-a",
  ];

  const RemixStub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <InviteUserForm scope={scope} groupOptions={groupOptions} />
      ),
    },
  ]);

  return render(<RemixStub initialEntries={["/"]} />);
}

describe("InviteUserForm", () => {
  test("renders all form fields", () => {
    renderForm();

    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("First name")).toBeInTheDocument();
    expect(screen.getByText("Last name")).toBeInTheDocument();
    expect(screen.getByText("Group Membership")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
  });

  test("shows help text on Enabled field", () => {
    renderForm();

    expect(
      screen.getByText(
        "Uncheck to pre-provision the account without granting immediate access.",
      ),
    ).toBeInTheDocument();
  });

  test("shows empty-state text when no group options", () => {
    renderForm({ groupOptions: [] });

    expect(
      screen.getByText("No groups available in this scope."),
    ).toBeInTheDocument();
  });

  test("renders group select when options are available", () => {
    renderForm({ groupOptions: ["cytario/lab", "cytario/lab/team-a"] });

    expect(
      screen.queryByText("No groups available in this scope."),
    ).not.toBeInTheDocument();
  });
});
