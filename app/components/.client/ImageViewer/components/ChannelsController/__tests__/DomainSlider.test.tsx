import { render, screen, fireEvent } from "@testing-library/react";
import { Mock } from "vitest";

import { select } from "../../../state/selectors";
import { ChannelsState } from "../../../state/types";
import { useViewerStore } from "../../../state/ViewerStoreContext";
import { DomainSlider } from "../DomainSlider";

vi.mock("../../../state/ViewerStoreContext", () => ({
  useViewerStore: vi.fn(),
}));

const Red = {
  color: [255, 0, 0],
  isVisible: true,
  pixelValue: 100,
  domain: [0, 255],
  contrastLimits: [12, 200],
};

const Green = {
  color: [0, 255, 0],
  isVisible: false,
  pixelValue: 50,
  domain: [0, 255],
  contrastLimits: [12, 200],
};

describe("DomainSlider", () => {
  const mockUpdateChannelsState = vi.fn();
  const mockSetSelectedChannelId = vi.fn();

  test("renders the slider when a channel is selected", () => {
    (useViewerStore as Mock).mockImplementation((selector) => {
      switch (selector) {
        case select.channelsState:
          return {
            Red: {
              color: [255, 0, 0],
              isVisible: true,
              pixelValue: 100,
              domain: [0, 255],
            },
            Green: {
              color: [0, 255, 0],
              isVisible: false,
              pixelValue: 50,
              domain: [0, 255],
            },
          } as unknown as ChannelsState;

        case select.selectedChannelId:
          return "Red";
        case select.selectedChannel:
          return {
            color: [255, 0, 0],
            isVisible: true,
            pixelValue: 100,
            domain: [0, 255],
            contrastLimits: [12, 200],
          };

        case select.setSelectedChannelId:
          return mockSetSelectedChannelId;

        case select.setContrastLimits:
          return mockUpdateChannelsState;
      }
    });

    render(<DomainSlider domain={[0, 255]} />);

    // rc-slider creates a range slider with two handles, so there are multiple sliders
    const sliders = screen.getAllByRole("slider");
    expect(sliders).toHaveLength(2);
  });

  test("does not render slider if no channel is selected", () => {
    (useViewerStore as Mock).mockImplementation((selector) => {
      switch (selector) {
        case select.selectedChannelId:
          return null;
        case select.selectedChannel:
          return null;
      }
    });

    render(<DomainSlider domain={[0, 255]} />);

    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  test("updates contrast limits on change", () => {
    (useViewerStore as Mock).mockImplementation((selector) => {
      switch (selector) {
        case select.channelsState:
          return {
            Red,
            Green,
          } as unknown as ChannelsState;

        case select.selectedChannelId:
          return "Red";

        case select.selectedChannel:
          return Red;

        case select.setSelectedChannelId:
          return mockSetSelectedChannelId;

        case select.setContrastLimits:
          return mockUpdateChannelsState;
      }
    });

    render(<DomainSlider domain={[0, 255]} />);

    // Find the slider thumb
    const sliders = screen.getAllByRole("slider");

    const [, slider] = sliders;

    // fireEvent.change(slider, { target: { value: 100 } });

    // // Simulate user interaction
    fireEvent.mouseDown(slider, { clientX: 0 });
    fireEvent.mouseMove(slider, { clientX: 10 }); // Move slider
    fireEvent.mouseUp(slider);

    // Expect update function to have been called
    expect(mockUpdateChannelsState).toHaveBeenCalledWith([12, 255]);
  });
});
