import { RadioGroup } from "@headlessui/react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Mock } from "vitest";

import { select } from "../../../state/selectors";
import { ChannelsStateColumns } from "../../../state/types";
import { useViewerStore } from "../../../state/ViewerStoreContext";
import { ChannelsControllerItem } from "../ChannelsControllerItem";

vi.mock("../../../state/ViewerStoreContext", () => ({
  useViewerStore: vi.fn(),
}));

describe("ChannelsControllerItem", () => {
  const mockToggleChannelVisibility = vi.fn();
  const mockOnColorChange = vi.fn();

  const defaultProps = {
    name: "Red" as keyof ChannelsStateColumns,
    color: [255, 0, 0, 255] as [number, number, number, number],
    isVisible: true,
    isLoading: false,
    pixelValue: 100,
    maxDomain: 255,
    visibleChannelCount: 1,
    toggleChannelVisibility: mockToggleChannelVisibility,
    onColorChange: mockOnColorChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useViewerStore as Mock).mockImplementation((selector) => {
      if (selector === select.selectedChannelId) {
        return "Red";
      }
      return undefined;
    });
  });

  const renderWithRadioGroup = (props = {}) => {
    return render(
      <RadioGroup value="Red" onChange={vi.fn()}>
        <ChannelsControllerItem {...defaultProps} {...props} />
      </RadioGroup>
    );
  };

  test("renders channel name", () => {
    renderWithRadioGroup();
    expect(screen.getByText("Red")).toBeInTheDocument();
  });

  test("renders pixel value when greater than 0", () => {
    renderWithRadioGroup({ pixelValue: 150 });
    expect(screen.getByText("150")).toBeInTheDocument();
  });

  test("does not render pixel value when 0", () => {
    renderWithRadioGroup({ pixelValue: 0 });
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  test("renders visibility switch", () => {
    renderWithRadioGroup();
    const switchElement = screen.getByRole("switch");
    expect(switchElement).toBeInTheDocument();
  });

  test("switch is checked when channel is visible", () => {
    renderWithRadioGroup({ isVisible: true });
    const switchElement = screen.getByRole("switch");
    expect(switchElement).toHaveAttribute("aria-checked", "true");
  });

  test("switch is unchecked when channel is not visible", () => {
    renderWithRadioGroup({ isVisible: false });
    const switchElement = screen.getByRole("switch");
    expect(switchElement).toHaveAttribute("aria-checked", "false");
  });

  test("calls toggleChannelVisibility when switch is clicked", () => {
    renderWithRadioGroup();
    const switchElement = screen.getByRole("switch");
    fireEvent.click(switchElement);
    expect(mockToggleChannelVisibility).toHaveBeenCalled();
  });

  describe("MAX_VISIBLE_CHANNELS limit (6 channels)", () => {
    test("switch is not disabled when visible channel count is below limit", () => {
      renderWithRadioGroup({
        isVisible: false,
        visibleChannelCount: 5,
      });
      const switchElement = screen.getByRole("switch");
      expect(switchElement).not.toBeDisabled();
    });

    test("switch is disabled when visible channel count reaches limit and channel is not visible", () => {
      renderWithRadioGroup({
        isVisible: false,
        visibleChannelCount: 6,
      });
      const switchElement = screen.getByRole("switch");
      expect(switchElement).toBeDisabled();
    });

    test("switch is not disabled for visible channels even when limit is reached", () => {
      renderWithRadioGroup({
        isVisible: true,
        visibleChannelCount: 6,
      });
      const switchElement = screen.getByRole("switch");
      expect(switchElement).not.toBeDisabled();
    });

    test("switch is disabled when visible channel count exceeds limit and channel is not visible", () => {
      renderWithRadioGroup({
        isVisible: false,
        visibleChannelCount: 7,
      });
      const switchElement = screen.getByRole("switch");
      expect(switchElement).toBeDisabled();
    });
  });

  describe("intensity indicator", () => {
    test("shows intensity indicator when channel is visible", () => {
      const { container } = renderWithRadioGroup({
        isVisible: true,
        pixelValue: 127,
        maxDomain: 255,
      });
      // The indicator should be approximately 50% width (127/255)
      const indicator = container.querySelector(
        '[style*="width"]'
      ) as HTMLElement;
      expect(indicator).toBeInTheDocument();
      expect(indicator?.style.width).toBe("49.80392156862745%");
    });

    test("does not show intensity indicator when channel is not visible", () => {
      const { container } = renderWithRadioGroup({
        isVisible: false,
        pixelValue: 127,
        maxDomain: 255,
      });
      // The intensity indicator div should not have the colored bar
      const intensityBars = container.querySelectorAll(
        '.h-full[style*="backgroundColor"]'
      );
      expect(intensityBars.length).toBe(0);
    });
  });

  test("shows loading indicator when isLoading is true", () => {
    const { container } = renderWithRadioGroup({ isLoading: true });
    // LavaLoader has a specific class or structure we can look for
    const loader = container.querySelector('[class*="absolute"]');
    expect(loader).toBeInTheDocument();
  });
});
