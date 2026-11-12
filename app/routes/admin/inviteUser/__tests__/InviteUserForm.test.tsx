import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { InviteUserForm } from "../inviteUser.form";

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useSubmit: () => vi.fn() };
});

const groups = [
  { id: "g1", path: "cytario/lab", name: "lab" },
  { id: "g2", path: "cytario/lab/team-a", name: "team-a" },
];

function renderForm() {
  const RemixStub = createRoutesStub([
    {
      path: "/",
      Component: () => <InviteUserForm groups={groups} />,
    },
  ]);

  return render(<RemixStub initialEntries={["/"]} />);
}

describe("InviteUserForm", () => {
  test("renders email and group multi-select, no name fields", () => {
    renderForm();

    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Groups")).toBeInTheDocument();
    expect(screen.queryByText("First name (optional)")).not.toBeInTheDocument();
    expect(screen.queryByText("Last name (optional)")).not.toBeInTheDocument();
  });

  test("explains that groups are applied at first login", () => {
    renderForm();

    expect(screen.getByText(/joins the selected groups at their first login/i)).toBeInTheDocument();
  });
});
