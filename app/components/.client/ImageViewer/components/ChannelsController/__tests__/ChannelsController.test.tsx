import { TabGroup } from "@headlessui/react";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Mock } from "vitest";

import { select } from "../../../state/selectors";
import { useViewerStore } from "../../../state/ViewerStoreContext";
import {
  useFeatureBarStore,
  useFeatureItemStore,
} from "../../FeatureBar/useFeatureBar";
import { ChannelsController } from "../ChannelsController";

vi.mock("../../../state/ViewerStoreContext", () => ({
  useViewerStore: vi.fn(),
}));

vi.mock("../../FeatureBar/useFeatureBar", () => ({
  useFeatureBarStore: vi.fn(),
  useFeatureItemStore: vi.fn(),
  FeatureItemStoreProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock("../Histogram", () => ({
  Histogram: vi.fn(() => <div data-testid="histogram-mock" />),
}));

describe("ChannelsController", () => {
  const mockSetChannelVisibility = vi.fn();
  const mockSetSelectedChannelId = vi.fn();
  const mockSetChannelColor = vi.fn();
  const mockSetChannelsOpacity = vi.fn();

  const mockChannelsState = {
    Red: {
      color: [255, 0, 0],
      isVisible: true,
      isLoading: false,
      domain: [0, 255],
    },
    Green: {
      color: [0, 255, 0],
      isVisible: false,
      isLoading: false,
      domain: [0, 255],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    (useViewerStore as Mock).mockImplementation((selector) => {
      switch (selector) {
        case select.layersStates:
          return [
            {
              channels: mockChannelsState,
              channelIds: ["Red", "Green"],
            },
          ];

        case select.channelsState:
          return mockChannelsState;

        case select.channelIds:
          return ["Red", "Green"];

        case select.maxChannelDomain:
          return 255;

        case select.visibleChannelCount:
          return 1;

        case select.selectedChannelId:
          return "Red";

        case select.setSelectedChannelId:
          return mockSetSelectedChannelId;

        case select.setChannelVisibility:
          return mockSetChannelVisibility;

        case select.setChannelColor:
          return mockSetChannelColor;

        case select.channelsOpacity:
          return 1;

        case select.setChannelsOpacity:
          return mockSetChannelsOpacity;

        default:
          return undefined;
      }
    });

    (useFeatureBarStore as unknown as Mock).mockImplementation((selector) => {
      const state = {
        isExpanded: true,
        setIsExpanded: vi.fn(),
        pixelValues: { Red: 100, Green: 50 },
      };
      return selector(state);
    });

    (useFeatureItemStore as Mock).mockImplementation((selector) => {
      const state = {
        isOpen: true,
        setIsOpen: vi.fn(),
      };
      return selector(state);
    });
  });

  const renderWithTabGroup = () => {
    return render(
      <TabGroup>
        <ChannelsController />
      </TabGroup>
    );
  };

  test("renders the component", () => {
    renderWithTabGroup();

    const button = screen.getByRole("button", {
      name: "Channels",
    });

    expect(button).toBeInTheDocument();

    fireEvent.click(button);

    expect(screen.getByText("Red")).toBeInTheDocument();
  });

  test("renders the correct number of channels", () => {
    renderWithTabGroup();
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(screen.getByText("Red")).toBeInTheDocument();
    expect(screen.getByText("Green")).toBeInTheDocument();
  });

  test("selects a channel when clicked", () => {
    renderWithTabGroup();
    const greenChannel = screen.getByText("Green").closest("div");
    expect(greenChannel).toBeInTheDocument();

    if (greenChannel) {
      fireEvent.click(greenChannel);
      expect(mockSetSelectedChannelId).toHaveBeenCalledWith("Green");
      expect(mockSetChannelVisibility).toHaveBeenCalledWith("Green", true);
    }
  });

  test("renders switches for channel visibility", () => {
    renderWithTabGroup();
    const switches = screen.getAllByRole("switch");

    // Should have switches for Red and Green channels (2), plus FeatureItem toggle (1)
    expect(switches.length).toBeGreaterThanOrEqual(2);
  });
});
