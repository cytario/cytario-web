import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { RGB } from "../../../state/store/types";
import { AnnotationGroupRow } from "../AnnotationGroupRow";

const RED: RGB = [255, 0, 0];

describe("AnnotationGroupRow", () => {
  test("renders the group name", () => {
    render(
      <AnnotationGroupRow
        name="Tumor"
        count={3}
        color={RED}
        isVisible={true}
        onToggleVisibility={vi.fn()}
      />,
    );

    expect(screen.getByText("Tumor")).toBeInTheDocument();
  });

  test("renders the item count", () => {
    render(
      <AnnotationGroupRow
        name="Stroma"
        count={7}
        color={RED}
        isVisible={true}
        onToggleVisibility={vi.fn()}
      />,
    );

    expect(screen.getByText("7")).toBeInTheDocument();
  });

  test("visibility switch has an accessible label containing the group name", () => {
    render(
      <AnnotationGroupRow
        name="Tumor"
        count={1}
        color={RED}
        isVisible={true}
        onToggleVisibility={vi.fn()}
      />,
    );

    expect(screen.getByRole("switch", { name: "Toggle Tumor visibility" })).toBeInTheDocument();
  });

  test("calls onToggleVisibility when the switch is clicked", () => {
    const onToggle = vi.fn();
    render(
      <AnnotationGroupRow
        name="Tumor"
        count={1}
        color={RED}
        isVisible={true}
        onToggleVisibility={onToggle}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Toggle Tumor visibility" }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test("shows a ColorPicker swatch (button) when recolorable (color non-null + onColorChange provided)", () => {
    render(
      <AnnotationGroupRow
        name="Tumor"
        count={1}
        color={RED}
        isVisible={true}
        onToggleVisibility={vi.fn()}
        onColorChange={vi.fn()}
      />,
    );

    // ColorPicker renders a button for the swatch — role="button" with a color label
    const colorButton = screen.getByRole("button");
    expect(colorButton).toBeInTheDocument();
  });

  test("shows a disabled (read-only) swatch for the Unclassified group", () => {
    render(
      <AnnotationGroupRow
        name="Unclassified"
        count={2}
        color={null}
        isUnclassified
        isVisible={true}
        onToggleVisibility={vi.fn()}
      />,
    );

    expect(screen.getByRole("button")).toBeDisabled();
  });

  test("shows a disabled (read-only) swatch when color is set but onColorChange is missing", () => {
    render(
      <AnnotationGroupRow
        name="Tumor"
        count={2}
        color={RED}
        isVisible={true}
        onToggleVisibility={vi.fn()}
        onColorChange={undefined}
      />,
    );

    // Read-only peer class: a static, non-interactive swatch (disabled ColorPicker).
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
