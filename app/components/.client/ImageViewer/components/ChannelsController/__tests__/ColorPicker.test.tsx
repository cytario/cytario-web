import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { OVERLAY_COLORS } from "../../OverlaysController/getOverlayState";
import { ColorPicker } from "../ColorPicker";

const RED_RGBA: [number, number, number, number] = [255, 0, 0, 255];

const openPopover = () => {
  // The trigger has aria-haspopup; click it.
  const trigger = screen.getByRole("button", { expanded: false });
  fireEvent.click(trigger);
};

describe("ColorPicker", () => {
  test("renders the trigger swatch with current color", () => {
    render(<ColorPicker color={RED_RGBA} onColorChange={vi.fn()} />);
    const triggers = screen.getAllByRole("button");
    expect(triggers.length).toBeGreaterThan(0);
  });

  test("opens popover and shows 9 quick-pick swatches + chevron", async () => {
    render(<ColorPicker color={RED_RGBA} onColorChange={vi.fn()} />);
    openPopover();

    const presetButtons = await screen.findAllByLabelText(/Preset color/);
    expect(presetButtons).toHaveLength(OVERLAY_COLORS.length + 1); // 8 + white

    expect(screen.getByLabelText(/Show advanced picker/)).toBeInTheDocument();
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

  test("preserves the input alpha when emitting from a preset", async () => {
    const onColorChange = vi.fn();
    render(
      <ColorPicker color={[255, 0, 0, 128]} onColorChange={onColorChange} />,
    );
    openPopover();

    const presetButtons = await screen.findAllByLabelText(/Preset color/);
    fireEvent.click(presetButtons[0]); // Red

    expect(onColorChange).toHaveBeenCalledWith([255, 0, 0, 128]);
  });

  test("chevron toggles the advanced picker panel", async () => {
    render(<ColorPicker color={RED_RGBA} onColorChange={vi.fn()} />);
    openPopover();

    const chevron = await screen.findByLabelText(/Show advanced picker/);
    expect(chevron).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(chevron);

    expect(screen.getByLabelText(/Hide advanced picker/)).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByLabelText("Hex")).toBeInTheDocument();
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
