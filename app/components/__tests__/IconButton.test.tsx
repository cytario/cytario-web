import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IconButton } from "../Controls/IconButton";

describe("IconButton", () => {
  it("renders children correctly", () => {
    const { getByRole } = render(<IconButton icon="X" onClick={() => {}} />);
    expect(getByRole("button")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const handleClick = vi.fn();
    const { getByRole } = render(<IconButton icon="X" onClick={handleClick} />);
    fireEvent.click(getByRole("button"));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const handleClick = vi.fn();
    const { getByRole } = render(
      <IconButton icon="X" onClick={handleClick} disabled />
    );
    fireEvent.click(getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("applies disabled attribute correctly", () => {
    const { getByRole } = render(
      <IconButton icon="X" onClick={() => {}} disabled />
    );
    expect(getByRole("button")).toBeDisabled();
  });
});
