import { render, screen, fireEvent } from "@testing-library/react";
import { Mock } from "vitest";

import { select } from "../../../state/store/selectors";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { Histogram } from "../Histogram";

vi.mock("../../../state/store/ViewerStoreContext", () => ({
  useViewerStore: vi.fn(),
}));

vi.mock("../DomainSlider", () => ({
  DomainSlider: ({ domain }: { domain: [number, number] }) => (
    <div data-testid="domain-slider" data-domain={JSON.stringify(domain)} />
  ),
}));

vi.mock("../MinMaxSettings", () => ({
  MinMaxSettings: () => <div data-testid="min-max-settings" />,
}));

vi.mock("../HistogramChannel", () => ({
  HistogramChannel: ({
    channelIndex,
    color,
    logScaleX,
    logScaleY,
  }: {
    channelIndex: number;
    color: string;
    logScaleX: boolean;
    logScaleY: boolean;
  }) => (
    <g
      data-testid={`histogram-channel-${channelIndex}`}
      data-color={color}
      data-log-scale-x={String(logScaleX)}
      data-log-scale-y={String(logScaleY)}
    />
  ),
}));

describe("Histogram", () => {
  const mockChannelsState = {
    Red: {
      color: [255, 0, 0] as [number, number, number],
      isVisible: true,
      histogram: [10, 50, 100, 50, 10],
      domain: [0, 255] as [number, number],
      contrastLimits: [0, 255] as [number, number],
    },
    Green: {
      color: [0, 255, 0] as [number, number, number],
      isVisible: true,
      histogram: [5, 25, 50, 25, 5],
      domain: [0, 255] as [number, number],
      contrastLimits: [10, 200] as [number, number],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ResizeObserver
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    }));

    (useViewerStore as Mock).mockImplementation((selector) => {
      if (selector === select.channelsState) {
        return mockChannelsState;
      }
      if (selector === select.selectedChannel) {
        return mockChannelsState.Red;
      }
      return undefined;
    });
  });

  test("renders histogram container", () => {
    render(<Histogram />);

    const svg = document.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  test("renders HistogramChannel for each visible channel", () => {
    render(<Histogram />);

    // Both channels are visible
    expect(screen.getByTestId("histogram-channel-0")).toBeInTheDocument();
    expect(screen.getByTestId("histogram-channel-1")).toBeInTheDocument();
  });

  test("does not render HistogramChannel for invisible channels", () => {
    (useViewerStore as Mock).mockImplementation((selector) => {
      if (selector === select.channelsState) {
        return {
          ...mockChannelsState,
          Green: { ...mockChannelsState.Green, isVisible: false },
        };
      }
      if (selector === select.selectedChannel) {
        return mockChannelsState.Red;
      }
      return undefined;
    });

    render(<Histogram />);

    // Only one channel should be rendered (Red is visible, Green is not)
    const channels = screen.getAllByTestId(/histogram-channel-/);
    expect(channels).toHaveLength(1);
  });

  test("renders DomainSlider with max domain", () => {
    render(<Histogram />);

    const slider = screen.getByTestId("domain-slider");
    expect(slider).toBeInTheDocument();

    const domain = JSON.parse(slider.getAttribute("data-domain") || "[]");
    expect(domain).toEqual([0, 255]);
  });

  test("renders MinMaxSettings", () => {
    render(<Histogram />);

    expect(screen.getByTestId("min-max-settings")).toBeInTheDocument();
  });

  test("renders X axis scale toggle, but no Y toggle", () => {
    render(<Histogram />);

    expect(screen.getByLabelText("Intensity axis scale: linear")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Count axis scale/)).not.toBeInTheDocument();
  });

  test("keeps Y axis logarithmic and X linear by default", () => {
    render(<Histogram />);

    const channel = screen.getByTestId("histogram-channel-0");
    expect(channel).toHaveAttribute("data-log-scale-y", "true");
    expect(channel).toHaveAttribute("data-log-scale-x", "false");
  });

  test("renders start/middle/end X axis value ticks", () => {
    render(<Histogram />);

    // maxDomain 255, linear → 0, round(127.5)=128, 255
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("128")).toBeInTheDocument();
    expect(screen.getByText("255")).toBeInTheDocument();
  });

  test("toggles X axis scale on click and updates ticks", () => {
    render(<Histogram />);

    fireEvent.click(screen.getByLabelText("Intensity axis scale: linear"));

    const channel = screen.getByTestId("histogram-channel-0");
    expect(channel).toHaveAttribute("data-log-scale-x", "true");
    // Symlog middle tick is far below the linear midpoint (128).
    expect(screen.queryByText("128")).not.toBeInTheDocument();
  });

  test("sorts selected channel to render last (on top)", () => {
    (useViewerStore as Mock).mockImplementation((selector) => {
      if (selector === select.channelsState) {
        return mockChannelsState;
      }
      if (selector === select.selectedChannel) {
        return mockChannelsState.Red; // Red is selected
      }
      return undefined;
    });

    render(<Histogram />);

    // Both channels should be rendered
    const channels = screen.getAllByTestId(/histogram-channel-/);
    expect(channels).toHaveLength(2);

    // Red (selected) should be rendered last (index 1 in sorted array)
    // rgb() returns "rgba(r, g, b, 255)" format
    const lastChannel = channels[channels.length - 1];
    expect(lastChannel.getAttribute("data-color")).toContain("255, 0, 0");
  });

  test("handles empty channels state", () => {
    (useViewerStore as Mock).mockImplementation((selector) => {
      if (selector === select.channelsState) {
        return {};
      }
      if (selector === select.selectedChannel) {
        return null;
      }
      return undefined;
    });

    render(<Histogram />);

    // Should still render container but no channels
    expect(screen.queryByTestId(/histogram-channel-/)).not.toBeInTheDocument();
    expect(screen.getByTestId("domain-slider")).toBeInTheDocument();
  });

  test("handles null channels state", () => {
    (useViewerStore as Mock).mockImplementation((selector) => {
      if (selector === select.channelsState) {
        return null;
      }
      if (selector === select.selectedChannel) {
        return null;
      }
      return undefined;
    });

    render(<Histogram />);

    // Should still render without crashing
    expect(screen.getByTestId("domain-slider")).toBeInTheDocument();
  });

  test("calculates max domain from all channels", () => {
    (useViewerStore as Mock).mockImplementation((selector) => {
      if (selector === select.channelsState) {
        return {
          Channel1: {
            ...mockChannelsState.Red,
            domain: [0, 65535] as [number, number],
          },
          Channel2: {
            ...mockChannelsState.Green,
            domain: [0, 255] as [number, number],
          },
        };
      }
      if (selector === select.selectedChannel) {
        return null;
      }
      return undefined;
    });

    render(<Histogram />);

    const slider = screen.getByTestId("domain-slider");
    const domain = JSON.parse(slider.getAttribute("data-domain") || "[]");
    expect(domain).toEqual([0, 65535]);
  });
});
