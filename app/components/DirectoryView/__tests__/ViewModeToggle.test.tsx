import { render, screen } from "@testing-library/react";

import { useLayoutStore } from "../useLayoutStore";
import { ViewModeToggle } from "../ViewModeToggle";

describe("ViewModeToggle", () => {
  beforeEach(() => {
    useLayoutStore.setState({ viewMode: "grid" });
  });

  test("renders a segmented control with View mode label", () => {
    render(<ViewModeToggle />);

    expect(
      screen.getByRole("radiogroup", { name: "View mode" }),
    ).toBeInTheDocument();
  });

  test("renders all four view mode buttons", () => {
    render(<ViewModeToggle />);

    expect(screen.getByRole("radio", { name: "List view" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Grid view" })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Compact grid" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Tree view" })).toBeInTheDocument();
  });

  test("reflects the current view mode from the store", () => {
    useLayoutStore.setState({ viewMode: "list" });
    render(<ViewModeToggle />);

    expect(screen.getByRole("radio", { name: "List view" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Grid view" })).not.toBeChecked();
  });

  test("updates the store when a mode is selected", async () => {
    const { userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();

    render(<ViewModeToggle />);

    await user.click(screen.getByRole("radio", { name: "Tree view" }));

    expect(useLayoutStore.getState().viewMode).toBe("tree");
  });
});
