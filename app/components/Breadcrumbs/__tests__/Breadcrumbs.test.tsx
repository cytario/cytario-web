import { render } from "@testing-library/react";
import { MemoryRouter, useMatches } from "react-router";
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

vi.mock("@cytario/design", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cytario/design")>();
  return {
    ...actual,
    Breadcrumbs: ({
      items,
    }: {
      items: Array<{ id: string; label: string; href?: string }>;
    }) => (
      <nav aria-label="Breadcrumb">
        <ol>
          {items.map((item) => (
            <li key={item.id}>
              {item.href ? <a href={item.href}>{item.label}</a> : item.label}
            </li>
          ))}
        </ol>
      </nav>
    ),
  };
});

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

    expect(container.querySelector("nav")).not.toBeInTheDocument();
  });

  test("does not render breadcrumbs if matches have no handle", () => {
    (useMatches as Mock).mockReturnValue([
      {},
      {
        handle: {},
      },
    ]);

    const { container } = render(<Breadcrumbs />);

    expect(container.querySelector("nav")).not.toBeInTheDocument();
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

  test("renders root crumb with Logo separately from design system Breadcrumbs", () => {
    (useMatches as Mock).mockReturnValue([
      {
        handle: {
          breadcrumb: () => ({ label: "Root", to: "/", isRoot: true }),
        },
      },
      { handle: { breadcrumb: () => ({ label: "Page", to: "/page" }) } },
    ]);

    const { getByText } = render(
      <MemoryRouter>
        <Breadcrumbs />
      </MemoryRouter>
    );

    expect(getByText("Logo")).toBeInTheDocument();
    expect(getByText("Page")).toBeInTheDocument();
  });

  test("marks the last crumb as active (no href)", () => {
    (useMatches as Mock).mockReturnValue([
      {
        handle: {
          breadcrumb: () => ({ label: "Home", to: "/home" }),
        },
      },
      {
        handle: {
          breadcrumb: () => ({
            label: "Current",
            to: "/current",
            isActive: true,
          }),
        },
      },
    ]);

    const { getByText } = render(<Breadcrumbs />);

    // Active crumb should not be a link
    const currentEl = getByText("Current");
    expect(currentEl.tagName).not.toBe("A");
  });
});
