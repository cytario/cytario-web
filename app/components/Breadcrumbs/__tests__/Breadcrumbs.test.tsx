import { render } from "@testing-library/react";
import { useMatches } from "react-router";
import { Mock } from "vitest";

import Breadcrumbs from "../Breadcrumbs";

vi.mock("react-router", () => ({
  useMatches: vi.fn(() => [
    { handle: { breadcrumb: () => <li key="Home">Home</li> } },
    { handle: { breadcrumb: () => <li key="Login">Login</li> } },
  ]),
}));

describe("Breadcrumbs", () => {
  test("renders breadcrumbs based on matches", () => {
    const { getByText } = render(<Breadcrumbs />);

    expect(getByText("Home")).toBeInTheDocument();
    expect(getByText("Login")).toBeInTheDocument();
  });

  test("does not render breadcrumbs if no matches", () => {
    (useMatches as Mock).mockReturnValue([]);

    const { container } = render(<Breadcrumbs />);

    expect(container.querySelector("ul")?.children.length).toBe(0);
  });

  test("does not render breadcrumbs if matches have no handle", () => {
    (useMatches as Mock).mockReturnValue([
      {},
      {
        handle: {},
      },
    ]);

    const { container } = render(<Breadcrumbs />);

    expect(container.querySelector("ul")?.children.length).toBe(0);
  });

  test("renders only matches with breadcrumb handle", () => {
    (useMatches as Mock).mockReturnValue([
      { handle: { breadcrumb: () => <li key="Home">Home</li> } },
      { handle: {} },
      { handle: { breadcrumb: () => <li key="Login">Login</li> } },
    ]);

    const { getByText, queryByText } = render(<Breadcrumbs />);

    expect(getByText("Home")).toBeInTheDocument();
    expect(getByText("Login")).toBeInTheDocument();
    expect(queryByText("About")).not.toBeInTheDocument();
  });
});
