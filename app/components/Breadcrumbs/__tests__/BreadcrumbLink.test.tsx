import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { BreadcrumbLink } from "../BreadcrumbLink";

describe("BreadcrumbLink", () => {
  it("renders correctly with given props", () => {
    const { getByText } = render(
      <MemoryRouter>
        <BreadcrumbLink to="/test" key="test">
          Test Link
        </BreadcrumbLink>
      </MemoryRouter>
    );

    expect(getByText("Test Link")).toBeInTheDocument();
  });

  it("has the correct href attribute", () => {
    const { getByRole } = render(
      <MemoryRouter>
        <BreadcrumbLink to="/test" key="test">
          Test Link
        </BreadcrumbLink>
      </MemoryRouter>
    );

    expect(getByRole("link")).toHaveAttribute("href", "/test");
  });

  it("applies custom className when provided", () => {
    const { getByRole } = render(
      <MemoryRouter>
        <BreadcrumbLink to="/test" key="test" className="custom-class">
          Test Link
        </BreadcrumbLink>
      </MemoryRouter>
    );

    const link = getByRole("link");

    // Check that the custom class is applied
    expect(link).toHaveClass("custom-class");

    // Check that the children are rendered
    expect(link).toHaveTextContent("Test Link");
  });

  it("does not apply custom className when not provided", () => {
    const { getByRole } = render(
      <MemoryRouter>
        <BreadcrumbLink to="/test" key="test">
          Test Link
        </BreadcrumbLink>
      </MemoryRouter>
    );

    const link = getByRole("link");

    // Ensure it doesn't have a custom class
    expect(link).not.toHaveClass("custom-class");
  });
});
