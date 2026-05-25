import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { InviteUserForm } from "../inviteUser.form";

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useSubmit: () => vi.fn() };
});

function renderForm(scope = "cytario/lab") {
  const RemixStub = createRoutesStub([
    {
      path: "/",
      Component: () => <InviteUserForm scope={scope} />,
    },
  ]);

  return render(<RemixStub initialEntries={["/"]} />);
}

describe("InviteUserForm", () => {
  test("renders email + optional first/last name fields", () => {
    renderForm();

    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("First name (optional)")).toBeInTheDocument();
    expect(screen.getByText("Last name (optional)")).toBeInTheDocument();
  });

  test("explains that group membership is assigned after the user accepts", () => {
    renderForm();

    expect(
      screen.getByText(/Group membership can be assigned after the user accepts/i),
    ).toBeInTheDocument();
  });

  test("does not render any group selector (org invite has no group target)", () => {
    renderForm();

    expect(screen.queryByText("Group Membership")).not.toBeInTheDocument();
    expect(screen.queryByText("No groups available in this scope.")).not.toBeInTheDocument();
  });
});
