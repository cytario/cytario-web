import { IconButton, type IconButtonProps } from "@cytario/design";
import { fireEvent, render, screen } from "@testing-library/react";
import { X } from "lucide-react";
import { describe, expect, test, vi } from "vitest";


// Cast to work around npm-link LucideIcon type mismatch; resolves with registry install
const XIcon = X as IconButtonProps["icon"];

describe("IconButton", () => {
  test("renders button correctly", () => {
    render(<IconButton icon={XIcon} aria-label="Close" onPress={() => {}} />);
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  test("calls onPress when clicked", () => {
    const handlePress = vi.fn();
    render(<IconButton icon={XIcon} aria-label="Close" onPress={handlePress} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(handlePress).toHaveBeenCalledTimes(1);
  });

  test("does not call onPress when disabled", () => {
    const handlePress = vi.fn();
    render(
      <IconButton icon={XIcon} aria-label="Close" onPress={handlePress} isDisabled />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(handlePress).not.toHaveBeenCalled();
  });

  test("applies disabled attribute correctly", () => {
    render(
      <IconButton icon={XIcon} aria-label="Close" onPress={() => {}} isDisabled />,
    );
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  });
});
