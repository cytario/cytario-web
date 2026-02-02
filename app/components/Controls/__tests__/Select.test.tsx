import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Select } from "~/components/Controls";

describe("Select", () => {
  test("should render select element with children", () => {
    render(
      <Select>
        <option value="option1">Option 1</option>
        <option value="option2">Option 2</option>
      </Select>,
    );

    const select = screen.getByRole("combobox");
    expect(select).toBeInTheDocument();
  });

  test("should forward props to HeadlessUI Select", () => {
    render(
      <Select data-testid="custom-select" disabled>
        <option value="test">Test Option</option>
      </Select>,
    );

    const select = screen.getByTestId("custom-select");
    expect(select).toBeInTheDocument();
    expect(select).toBeDisabled();
  });

  test("should render multiple options", () => {
    render(
      <Select>
        <option value="option1">Option 1</option>
        <option value="option2">Option 2</option>
        <option value="option3">Option 3</option>
      </Select>,
    );

    expect(screen.getByText("Option 1")).toBeInTheDocument();
    expect(screen.getByText("Option 2")).toBeInTheDocument();
    expect(screen.getByText("Option 3")).toBeInTheDocument();
  });
});
