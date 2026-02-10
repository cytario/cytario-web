import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { Select } from "~/components/Controls";

const options = [
  { value: "option1", label: "Option 1" },
  { value: "option2", label: "Option 2" },
  { value: "option3", label: "Option 3" },
];

describe("Select", () => {
  test("should render listbox with selected option", () => {
    render(
      <Select options={options} value="option1" onChange={vi.fn()} />,
    );

    expect(screen.getByRole("button")).toHaveTextContent("Option 1");
  });

  test("should render as disabled", () => {
    render(
      <Select options={options} value="option1" onChange={vi.fn()} disabled />,
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });

  test("should display the label of the selected value", () => {
    render(
      <Select options={options} value="option2" onChange={vi.fn()} />,
    );

    expect(screen.getByRole("button")).toHaveTextContent("Option 2");
  });
});
