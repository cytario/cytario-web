import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { Button } from "../Controls/Button";

describe("Button component", () => {
  it("renders the button with children", () => {
    const { container } = render(<Button onClick={() => {}}>Click me</Button>);
    expect(container).toMatchSnapshot(); // Snapshot the rendered button
  });

  it("calls onClick when clicked", () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    fireEvent.click(screen.getByText("Click me"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const handleClick = vi.fn();
    render(
      <Button onClick={handleClick} disabled>
        Click me
      </Button>
    );
    fireEvent.click(screen.getByText("Click me"));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("applies additional class names", () => {
    const { container } = render(
      <Button onClick={() => {}} className="extra-class">
        Click me
      </Button>
    );
    expect(container).toMatchSnapshot(); // Snapshot to check the applied class names
  });

  it("matches default styles with snapshot", () => {
    const { container } = render(<Button onClick={() => {}}>Click me</Button>);
    expect(container).toMatchSnapshot(); // Snapshot captures all default styles
  });
});
