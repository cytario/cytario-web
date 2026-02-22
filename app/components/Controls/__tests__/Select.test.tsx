import { Select } from "@cytario/design";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";


const items = [
  { id: "option1", name: "Option 1" },
  { id: "option2", name: "Option 2" },
  { id: "option3", name: "Option 3" },
];

describe("Select", () => {
  test("should render select with label", () => {
    render(<Select label="Test Select" items={items} />);

    expect(screen.getByText("Test Select")).toBeInTheDocument();
  });

  test("should render placeholder text", () => {
    render(
      <Select
        label="Test Select"
        items={items}
        placeholder="Choose an option"
      />,
    );

    expect(screen.getByText("Choose an option")).toBeInTheDocument();
  });

  test("should render as disabled", () => {
    render(<Select label="Test Select" items={items} isDisabled />);

    const trigger = screen.getByRole("button");
    expect(trigger).toBeDisabled();
  });

  test("should display error message", () => {
    render(
      <Select
        label="Test Select"
        items={items}
        errorMessage="Selection is required"
      />,
    );

    expect(screen.getByText("Selection is required")).toBeInTheDocument();
  });
});
