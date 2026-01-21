import { render, screen, fireEvent } from "@testing-library/react";
import { Mock } from "vitest";

import { select } from "../../../state/selectors";
import { useViewerStore } from "../../../state/ViewerStoreContext";
import { MinMaxSettings } from "../MinMaxSettings";

vi.mock("../../../state/ViewerStoreContext", () => ({
  useViewerStore: vi.fn(),
}));

describe("MinMaxSettings", () => {
  const mockSetContrastLimits = vi.fn();
  const mockResetContrastLimits = vi.fn();

  const mockSelectedChannel = {
    contrastLimits: [50, 200] as [number, number],
    contrastLimitsInitial: [0, 255] as [number, number],
    domain: [0, 255] as [number, number],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    (useViewerStore as Mock).mockImplementation((selector) => {
      if (selector === select.selectedChannel) {
        return mockSelectedChannel;
      }
      if (selector === select.setContrastLimits) {
        return mockSetContrastLimits;
      }
      // For resetContrastLimits which uses inline selector
      if (typeof selector === "function") {
        return selector({ resetContrastLimits: mockResetContrastLimits });
      }
      return undefined;
    });
  });

  test("renders min and max input fields", () => {
    render(<MinMaxSettings />);

    expect(screen.getByText("Min")).toBeInTheDocument();
    expect(screen.getByText("Max")).toBeInTheDocument();

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(2);
  });

  test("displays current contrast limits values", () => {
    render(<MinMaxSettings />);

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs[0]).toHaveValue(50); // min
    expect(inputs[1]).toHaveValue(200); // max
  });

  test("commits min value on blur", () => {
    render(<MinMaxSettings />);

    const minInput = screen.getAllByRole("spinbutton")[0];
    fireEvent.change(minInput, { target: { value: "75" } });
    fireEvent.blur(minInput);

    expect(mockSetContrastLimits).toHaveBeenCalledWith([75, 200]);
  });

  test("commits max value on blur", () => {
    render(<MinMaxSettings />);

    const maxInput = screen.getAllByRole("spinbutton")[1];
    fireEvent.change(maxInput, { target: { value: "180" } });
    fireEvent.blur(maxInput);

    expect(mockSetContrastLimits).toHaveBeenCalledWith([50, 180]);
  });

  test("commits value on Enter key", () => {
    render(<MinMaxSettings />);

    const minInput = screen.getAllByRole("spinbutton")[0];
    fireEvent.change(minInput, { target: { value: "30" } });
    fireEvent.keyDown(minInput, { key: "Enter" });
    // Enter calls blur() which triggers the blur event handler
    fireEvent.blur(minInput);

    expect(mockSetContrastLimits).toHaveBeenCalledWith([30, 200]);
  });

  test("cancels editing on Escape key without committing", () => {
    render(<MinMaxSettings />);

    const minInput = screen.getAllByRole("spinbutton")[0];
    fireEvent.change(minInput, { target: { value: "999" } });
    fireEvent.keyDown(minInput, { key: "Escape" });

    // Should not commit the invalid value
    expect(mockSetContrastLimits).not.toHaveBeenCalled();
  });

  test("clamps min value to domain bounds", () => {
    render(<MinMaxSettings />);

    const minInput = screen.getAllByRole("spinbutton")[0];
    fireEvent.change(minInput, { target: { value: "-50" } });
    fireEvent.blur(minInput);

    // Should clamp to domain min (0)
    expect(mockSetContrastLimits).toHaveBeenCalledWith([0, 200]);
  });

  test("clamps max value to domain bounds", () => {
    render(<MinMaxSettings />);

    const maxInput = screen.getAllByRole("spinbutton")[1];
    fireEvent.change(maxInput, { target: { value: "500" } });
    fireEvent.blur(maxInput);

    // Should clamp to domain max (255)
    expect(mockSetContrastLimits).toHaveBeenCalledWith([50, 255]);
  });

  test("ensures min does not exceed max", () => {
    render(<MinMaxSettings />);

    const minInput = screen.getAllByRole("spinbutton")[0];
    fireEvent.change(minInput, { target: { value: "250" } });
    fireEvent.blur(minInput);

    // Min should be clamped to max (200)
    expect(mockSetContrastLimits).toHaveBeenCalledWith([200, 200]);
  });

  test("ensures max does not go below min", () => {
    render(<MinMaxSettings />);

    const maxInput = screen.getAllByRole("spinbutton")[1];
    fireEvent.change(maxInput, { target: { value: "10" } });
    fireEvent.blur(maxInput);

    // Max should be clamped to min (50)
    expect(mockSetContrastLimits).toHaveBeenCalledWith([50, 50]);
  });

  test("does not commit invalid (NaN) values", () => {
    render(<MinMaxSettings />);

    const minInput = screen.getAllByRole("spinbutton")[0];
    fireEvent.change(minInput, { target: { value: "abc" } });
    fireEvent.blur(minInput);

    expect(mockSetContrastLimits).not.toHaveBeenCalled();
  });

  test("reset button calls resetContrastLimits", () => {
    render(<MinMaxSettings />);

    const resetButton = screen.getByRole("button");
    fireEvent.click(resetButton);

    expect(mockResetContrastLimits).toHaveBeenCalled();
  });

  test("reset button is disabled when limits match initial", () => {
    (useViewerStore as Mock).mockImplementation((selector) => {
      if (selector === select.selectedChannel) {
        return {
          contrastLimits: [0, 255],
          contrastLimitsInitial: [0, 255],
          domain: [0, 255],
        };
      }
      if (selector === select.setContrastLimits) {
        return mockSetContrastLimits;
      }
      if (typeof selector === "function") {
        return selector({ resetContrastLimits: mockResetContrastLimits });
      }
      return undefined;
    });

    render(<MinMaxSettings />);

    const resetButton = screen.getByRole("button");
    expect(resetButton).toBeDisabled();
  });

  test("inputs are disabled when no channel is selected", () => {
    (useViewerStore as Mock).mockImplementation((selector) => {
      if (selector === select.selectedChannel) {
        return null;
      }
      if (selector === select.setContrastLimits) {
        return mockSetContrastLimits;
      }
      if (typeof selector === "function") {
        return selector({ resetContrastLimits: mockResetContrastLimits });
      }
      return undefined;
    });

    render(<MinMaxSettings />);

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs[0]).toBeDisabled();
    expect(inputs[1]).toBeDisabled();
  });

  test("reset button is disabled when no channel is selected", () => {
    (useViewerStore as Mock).mockImplementation((selector) => {
      if (selector === select.selectedChannel) {
        return null;
      }
      if (selector === select.setContrastLimits) {
        return mockSetContrastLimits;
      }
      if (typeof selector === "function") {
        return selector({ resetContrastLimits: mockResetContrastLimits });
      }
      return undefined;
    });

    render(<MinMaxSettings />);

    const resetButton = screen.getByRole("button");
    expect(resetButton).toBeDisabled();
  });

  test("shows default values when no channel selected", () => {
    (useViewerStore as Mock).mockImplementation((selector) => {
      if (selector === select.selectedChannel) {
        return null;
      }
      if (selector === select.setContrastLimits) {
        return mockSetContrastLimits;
      }
      if (typeof selector === "function") {
        return selector({ resetContrastLimits: mockResetContrastLimits });
      }
      return undefined;
    });

    render(<MinMaxSettings />);

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs[0]).toHaveValue(0);
    expect(inputs[1]).toHaveValue(0);
  });
});
