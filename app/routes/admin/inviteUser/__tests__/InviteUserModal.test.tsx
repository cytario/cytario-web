import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

import InviteModal from "../inviteUser.modal";

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

const groups = [{ id: "g1", path: "cytario/lab", name: "lab" }];

function renderModal() {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <InviteModal />,
      loader: () => ({ groups }),
    },
  ]);

  return render(<Stub initialEntries={["/"]} />);
}

describe("InviteModal", () => {
  test("offers the one invite form: token field, groups, cancel, send", async () => {
    renderModal();

    expect(await screen.findByRole("dialog", { name: "Invite Users" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByText("Groups")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send Invite" })).toBeInTheDocument();
    expect(screen.queryByText("Invite another")).not.toBeInTheDocument();
  });

  test("keeps the submit button disabled until an email token is committed", async () => {
    const user = userEvent.setup();
    renderModal();

    const submit = await screen.findByRole("button", { name: "Send Invite" });
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole("textbox", { name: "Email" }));
    await user.keyboard("a@x.com,");

    await waitFor(() => expect(submit).not.toBeDisabled());
  });

  test("keeps the label constant for several emails", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(await screen.findByRole("textbox", { name: "Email" }));
    await user.keyboard("a@x.com b@x.com c@x.com ");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Send Invite" })).not.toBeDisabled(),
    );
  });
});
