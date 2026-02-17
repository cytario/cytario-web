import { render } from "@testing-library/react";
import { useMatches } from "react-router";
import { Mock } from "vitest";

import { Breadcrumbs } from "../Breadcrumbs";

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useMatches: vi.fn(() => [
      { handle: { breadcrumb: () => ({ label: "Home", to: "/home" }) } },
      { handle: { breadcrumb: () => ({ label: "Login", to: "/login" }) } },
    ]),
  };
});

vi.mock("../BreadcrumbLink", () => ({
  BreadcrumbLink: ({
    children,
    to,
  }: {
    children: React.ReactNode;
    to: string;
  }) => (
    <li>
      <a href={to}>{children}</a>
    </li>
  ),
}));

vi.mock("../../Logo", () => ({
  Logo: () => <span>Logo</span>,
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
      { handle: { breadcrumb: () => ({ label: "Home", to: "/home" }) } },
      { handle: {} },
      { handle: { breadcrumb: () => ({ label: "Login", to: "/login" }) } },
    ]);

    const { getByText, queryByText } = render(<Breadcrumbs />);

    expect(getByText("Home")).toBeInTheDocument();
    expect(getByText("Login")).toBeInTheDocument();
    expect(queryByText("About")).not.toBeInTheDocument();
  });
});
