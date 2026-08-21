import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Mock } from "vitest";

import { select } from "../../../state/store/selectors";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { Views } from "../Views";
import { useFeatureItemStore } from "~/components/FeatureItem/useFeatureItem";

vi.mock("../../../state/store/ViewerStoreContext", () => ({
  useViewerStore: vi.fn(),
}));

vi.mock("~/components/FeatureItem/useFeatureItem", () => ({
  useFeatureItemStore: vi.fn(),
  FeatureItemStoreProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockSetViewName = vi.fn();
const mockSetActivePresetIndex = vi.fn();
const mockRemoveChannelsState = vi.fn();
const mockAddChannelsState = vi.fn();

function setupStore(overrides?: {
  layersStates?: { channels: Record<string, { isVisible: boolean }>; name?: string }[];
  channelIds?: string[];
  channels?: Record<string, Record<string, unknown>>;
  activePresetIndex?: number;
}) {
  const layersStates = overrides?.layersStates ?? [{ channels: {} }];
  const channelIds = overrides?.channelIds ?? [];
  const channels = overrides?.channels ?? {};
  const activePresetIndex = overrides?.activePresetIndex ?? 0;

  const mockState = {
    layersStates,
    channelIds,
    channels,
    imagePanelIndex: activePresetIndex,
    imagePanels: [0],
    setViewName: mockSetViewName,
    setActivePresetIndex: mockSetActivePresetIndex,
    removeChannelsState: mockRemoveChannelsState,
    addChannelsState: mockAddChannelsState,
  };

  vi.clearAllMocks();

  (useViewerStore as Mock).mockImplementation((selector) => {
    if (typeof selector === "function") {
      return selector(mockState);
    }
    switch (selector) {
      case select.activePresetIndex:
        return activePresetIndex;
      case select.setActivePresetIndex:
        return mockSetActivePresetIndex;
      case select.layersStates:
        return layersStates;
      case select.removeChannelsState:
        return mockRemoveChannelsState;
      case select.addChannelsState:
        return mockAddChannelsState;
      case select.setViewName:
        return mockSetViewName;
      default:
        return undefined;
    }
  });

  (useFeatureItemStore as Mock).mockReturnValue({ isOpen: true, setIsOpen: vi.fn() });
}

describe("Views", () => {
  test("renders as a FeatureItem accordion with title 'Views'", () => {
    setupStore();
    render(<Views />);
    expect(screen.getByText("Views")).toBeInTheDocument();
  });

  test("shows 'Add view' button", () => {
    setupStore();
    render(<Views />);
    expect(screen.getByRole("button", { name: "Add view" })).toBeInTheDocument();
  });

  test("shows auto-generated name from visible channels", () => {
    setupStore({
      layersStates: [
        {
          channels: {
            Red: { isVisible: true },
            Green: { isVisible: true },
            Blue: { isVisible: false },
          },
        },
      ],
      channelIds: ["Red", "Green", "Blue"],
      channels: {
        Red: { isVisible: false, contrastLimits: [0, 255], color: [255, 0, 0] },
        Green: { isVisible: false, contrastLimits: [0, 255], color: [0, 255, 0] },
        Blue: { isVisible: false, contrastLimits: [0, 255], color: [0, 0, 255] },
      },
    });
    render(<Views />);
    expect(screen.getByText("Red, Green")).toBeInTheDocument();
  });

  test("shows 'No channels' when no visible channels", () => {
    setupStore({
      layersStates: [{ channels: { Red: { isVisible: false } } }],
      channelIds: ["Red"],
    });
    render(<Views />);
    expect(screen.getByText("No channels")).toBeInTheDocument();
  });

  test("shows custom name when set", () => {
    setupStore({
      layersStates: [{ channels: {}, name: "My Custom View" }],
      channelIds: [],
    });
    render(<Views />);
    expect(screen.getByText("My Custom View")).toBeInTheDocument();
  });

  test("double-click on view label enters edit mode", () => {
    setupStore({
      layersStates: [{ channels: {} }],
      channelIds: [],
    });
    render(<Views />);
    const labelSpan = screen.getByText("No channels");
    fireEvent.doubleClick(labelSpan);
    expect(screen.getByDisplayValue("No channels")).toBeInTheDocument();
  });

  test("Enter commits the new name via setViewName", () => {
    setupStore({
      layersStates: [{ channels: {} }],
      channelIds: [],
    });
    render(<Views />);
    fireEvent.doubleClick(screen.getByText("No channels"));
    const input = screen.getByDisplayValue("No channels");
    fireEvent.change(input, { target: { value: "My Custom View" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockSetViewName).toHaveBeenCalledWith(0, "My Custom View");
  });

  test("Escape cancels editing without calling setViewName", () => {
    setupStore({
      layersStates: [{ channels: {} }],
      channelIds: [],
    });
    render(<Views />);
    fireEvent.doubleClick(screen.getByText("No channels"));
    const input = screen.getByDisplayValue("No channels");
    fireEvent.change(input, { target: { value: "Should Not Persist" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(mockSetViewName).not.toHaveBeenCalled();
    expect(screen.getByText("No channels")).toBeInTheDocument();
  });

  test("empty name on commit calls setViewName with null", () => {
    setupStore({
      layersStates: [{ channels: {}, name: "Custom" }],
      channelIds: [],
    });
    render(<Views />);
    fireEvent.doubleClick(screen.getByText("Custom"));
    const input = screen.getByDisplayValue("Custom");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockSetViewName).toHaveBeenCalledWith(0, null);
  });

  test("whitespace-only name calls setViewName with null", () => {
    setupStore({
      layersStates: [{ channels: {}, name: "Custom" }],
      channelIds: [],
    });
    render(<Views />);
    fireEvent.doubleClick(screen.getByText("Custom"));
    const input = screen.getByDisplayValue("Custom");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockSetViewName).toHaveBeenCalledWith(0, null);
  });
});
