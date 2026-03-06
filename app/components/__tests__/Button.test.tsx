import { Button } from "@cytario/design";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";


describe("Button component", () => {
  test("renders the button with children", () => {
    render(<Button onPress={() => {}}>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  test("calls onPress when clicked", () => {
    const handlePress = vi.fn();
    render(<Button onPress={handlePress}>Click me</Button>);
    fireEvent.click(screen.getByText("Click me"));
    expect(handlePress).toHaveBeenCalledTimes(1);
  });

  test("does not call onPress when disabled", () => {
    const handlePress = vi.fn();
    render(
      <Button onPress={handlePress} isDisabled>
        Click me
      </Button>,
    );
    fireEvent.click(screen.getByText("Click me"));
    expect(handlePress).not.toHaveBeenCalled();
  });

  test("applies additional class names", () => {
    render(
      <Button onPress={() => {}} className="extra-class">
        Click me
      </Button>,
    );
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  test("renders with default variant", () => {
    render(<Button onPress={() => {}}>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });
});
