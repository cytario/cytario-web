import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";

import { SectionHeaderRow } from "../SectionHeaderRow";

describe("SectionHeaderRow", () => {
  test("toggle variant renders a disclosure button with aria-expanded and slot content", () => {
    render(
      <SectionHeaderRow
        icon="Star"
        title="Favorites"
        onClick={() => {}}
        ariaExpanded={false}
        chevronSlot={<span>chevron</span>}
      />,
    );

    const button = screen.getByRole("button", { name: /Favorites/ });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("chevron")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  test("link variant renders an anchor without expander semantics", () => {
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => <SectionHeaderRow to="/jobs" icon="Layers" title="Jobs" />,
      },
    ]);
    render(<Stub initialEntries={["/"]} />);

    const link = screen.getByRole("link", { name: /Jobs/ });
    expect(link).toHaveAttribute("href", "/jobs");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  test("badge and actions render only when provided", () => {
    const { rerender } = render(
      <SectionHeaderRow icon="Star" title="Favorites" badge="3/8" actions={<span>act</span>} />,
    );
    expect(screen.getByText("3/8")).toBeInTheDocument();
    expect(screen.getByText("act")).toBeInTheDocument();

    rerender(<SectionHeaderRow icon="Star" title="Favorites" />);
    expect(screen.queryByText("3/8")).not.toBeInTheDocument();
    expect(screen.queryByText("act")).not.toBeInTheDocument();
  });
});
