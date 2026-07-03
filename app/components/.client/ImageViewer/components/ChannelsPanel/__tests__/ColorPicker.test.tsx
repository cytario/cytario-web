import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { OVERLAY_COLORS } from "../../OverlaysPanel/getOverlayState";
import { ColorPicker } from "../ColorPicker/ColorPicker";

const RED_RGBA: [number, number, number, number] = [255, 0, 0, 255];

const openPopover = () => {
  const trigger = screen.getByLabelText("Open color picker");
  fireEvent.click(trigger);
};

describe("ColorPicker", () => {
  test("renders the trigger swatch with current color", () => {
    render(<ColorPicker color={RED_RGBA} onColorChange={vi.fn()} />);
    const triggers = screen.getAllByRole("button");
    expect(triggers.length).toBeGreaterThan(0);
  });

  test("opens popover with the 9 quick-pick swatches", async () => {
    render(<ColorPicker color={RED_RGBA} onColorChange={vi.fn()} />);
    openPopover();

    const presetButtons = await screen.findAllByLabelText(/Preset color/);
    expect(presetButtons).toHaveLength(OVERLAY_COLORS.length + 1); // 8 + white
  });

  test("popover renders the HSV slider and hex input", async () => {
    render(<ColorPicker color={RED_RGBA} onColorChange={vi.fn()} />);
    openPopover();

    expect(await screen.findByLabelText("Hue")).toBeInTheDocument();
    expect(screen.getByLabelText("Hex")).toBeInTheDocument();
  });

  test("clicking a preset swatch calls onColorChange with that color", async () => {
    const onColorChange = vi.fn();
    render(<ColorPicker color={RED_RGBA} onColorChange={onColorChange} />);
    openPopover();

    const presetButtons = await screen.findAllByLabelText(/Preset color/);
    // Click the third preset (index 2 → Yellow [255,255,0,255]).
    fireEvent.click(presetButtons[2]);

    expect(onColorChange).toHaveBeenCalledWith([255, 255, 0, 255]);
  });

  test("ninth preset is white", async () => {
    const onColorChange = vi.fn();
    render(<ColorPicker color={RED_RGBA} onColorChange={onColorChange} />);
    openPopover();

    const presetButtons = await screen.findAllByLabelText(/Preset color/);
    fireEvent.click(presetButtons[8]); // ninth swatch

    expect(onColorChange).toHaveBeenCalledWith([255, 255, 255, 255]);
  });
});
