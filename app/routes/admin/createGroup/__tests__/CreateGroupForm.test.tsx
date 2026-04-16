import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { CreateGroupForm } from "../createGroup.form";

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useSubmit: () => vi.fn() };
});

function renderForm(scope = "cytario/lab") {
  const RemixStub = createRoutesStub([
    {
      path: "/",
      Component: () => <CreateGroupForm scope={scope} />,
    },
  ]);

  return render(<RemixStub initialEntries={["/"]} />);
}

describe("CreateGroupForm", () => {
  test("renders group name field", () => {
    renderForm();

    expect(screen.getByText("Group name")).toBeInTheDocument();
  });

  test("shows admin help text", () => {
    renderForm();

    expect(
      screen.getByText(/added as an admin of this group automatically/),
    ).toBeInTheDocument();
  });
});
