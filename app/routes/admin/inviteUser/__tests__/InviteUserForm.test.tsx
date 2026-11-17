import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { InviteUserForm } from "../inviteUser.form";

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useSubmit: () => vi.fn() };
});

// happy-dom's InputEvent has no getTargetRanges; react-aria's token field calls
// it on every edit and throws without it.
if (!("getTargetRanges" in InputEvent.prototype)) {
  (InputEvent.prototype as unknown as { getTargetRanges: () => Range[] }).getTargetRanges =
    () => [];
}

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
  test("renders the email token field and group multi-select, no name fields", () => {
    renderForm();

    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByText("Groups")).toBeInTheDocument();
    expect(screen.queryByText("First name (optional)")).not.toBeInTheDocument();
    expect(screen.queryByText("Last name (optional)")).not.toBeInTheDocument();
  });

  test("explains that groups are applied at first login", () => {
    renderForm();

    expect(screen.getByText(/joins the selected groups at their first login/i)).toBeInTheDocument();
  });

  test("commits a typed address as a removable token", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("textbox", { name: "Email" }));
    await user.keyboard("a@x.com,");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Remove a@x.com" })).toBeInTheDocument(),
    );
  });

  test("turns a delimiter-separated list into one token per address", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("textbox", { name: "Email" }));
    await user.keyboard("a@x.com b@x.com;c@x.com ");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Remove a@x.com" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove b@x.com" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove c@x.com" })).toBeInTheDocument();
    });
  });

  test("drops a token when its remove button is pressed", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("textbox", { name: "Email" }));
    await user.keyboard("a@x.com,");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Remove a@x.com" })).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: "Remove a@x.com" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Remove a@x.com" })).not.toBeInTheDocument(),
    );
  });
});
