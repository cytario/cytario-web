import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { Mock } from "vitest";

import { select } from "../../../../state/store/selectors";
import { useViewerStore } from "../../../../state/store/ViewerStoreContext";
import { ViewsControl } from "../ViewsControl";
import { useFeatureItemStore } from "~/components/FeatureItem/useFeatureItem";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

vi.mock("../../../../state/store/ViewerStoreContext", () => ({
  useViewerStore: vi.fn(),
}));

vi.mock("~/utils/connectionsStore/useConnectionsStore", () => ({
  useConnectionsStore: vi.fn(),
}));

vi.mock("~/components/FeatureItem/useFeatureItem", () => ({
  useFeatureItemStore: vi.fn(),
  FeatureItemStoreProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const mockSetViewName = vi.fn();
const mockSetActivePresetIndex = vi.fn();
const mockRemoveChannelsState = vi.fn();
const mockAddChannelsState = vi.fn();
const mockShareView = vi.fn();
const mockUnshareView = vi.fn();
const mockForkView = vi.fn();

const CURRENT_USER = "test-user";

function setupStore(overrides?: {
  layersStates?: {
    channels: Record<string, { isVisible: boolean }>;
    name?: string;
    shared?: boolean;
    author?: string;
  }[];
  channelIds?: string[];
  channels?: Record<string, Record<string, unknown>>;
  activePresetIndex?: number;
  accessLevel?: "read-only" | "annotate" | "read-write" | "admin";
  currentUserId?: string;
}) {
  const layersStates = (overrides?.layersStates ?? [{ channels: {} }]).map((ls) => ({
    ...ls,
    author: ls.author ?? overrides?.currentUserId ?? CURRENT_USER,
  }));
  const channelIds = overrides?.channelIds ?? [];
  const channels = overrides?.channels ?? {};
  const activePresetIndex = overrides?.activePresetIndex ?? 0;
  const accessLevel = overrides?.accessLevel ?? "read-write";
  const currentUserId = overrides?.currentUserId ?? CURRENT_USER;

  const mockState = {
    id: "test-conn/some/path.ome.tif",
    currentUserId,
    layersStates,
    channelIds,
    channels,
    imagePanelIndex: activePresetIndex,
    imagePanels: [0],
    setViewName: mockSetViewName,
    setActivePresetIndex: mockSetActivePresetIndex,
    removeChannelsState: mockRemoveChannelsState,
    addChannelsState: mockAddChannelsState,
    shareView: mockShareView,
    unshareView: mockUnshareView,
    forkView: mockForkView,
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

  (useConnectionsStore as unknown as Mock).mockReturnValue(accessLevel);
  (useFeatureItemStore as Mock).mockReturnValue({ isOpen: true, setIsOpen: vi.fn() });
}

describe("ViewsControl", () => {
  test("renders as a FeatureItem accordion with title 'Views'", () => {
    setupStore();
    render(<ViewsControl />);
    expect(screen.getByText("Views")).toBeInTheDocument();
  });

  test("shows 'Add view' button", () => {
    setupStore();
    render(<ViewsControl />);
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
    render(<ViewsControl />);
    expect(screen.getByText("Red, Green")).toBeInTheDocument();
  });

  test("shows 'No channels' when no visible channels", () => {
    setupStore({
      layersStates: [{ channels: { Red: { isVisible: false } } }],
      channelIds: ["Red"],
    });
    render(<ViewsControl />);
    expect(screen.getByText("No channels")).toBeInTheDocument();
  });

  test("shows custom name when set", () => {
    setupStore({
      layersStates: [{ channels: {}, name: "My Custom View" }],
      channelIds: [],
    });
    render(<ViewsControl />);
    expect(screen.getByText("My Custom View")).toBeInTheDocument();
  });

  test("double-click on view label enters edit mode", () => {
    setupStore({
      layersStates: [{ channels: {} }],
      channelIds: [],
    });
    render(<ViewsControl />);
    const labelSpan = screen.getByText("No channels");
    fireEvent.doubleClick(labelSpan);
    expect(screen.getByDisplayValue("No channels")).toBeInTheDocument();
  });

  test("Enter commits the new name via setViewName", () => {
    setupStore({
      layersStates: [{ channels: {} }],
      channelIds: [],
    });
    render(<ViewsControl />);
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
    render(<ViewsControl />);
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
    render(<ViewsControl />);
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
    render(<ViewsControl />);
    fireEvent.doubleClick(screen.getByText("Custom"));
    const input = screen.getByDisplayValue("Custom");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockSetViewName).toHaveBeenCalledWith(0, null);
  });

  test("renders three groups when views span local, own-shared, and peer-shared", () => {
    setupStore({
      layersStates: [
        { channels: {}, name: "Local view" },
        { channels: {}, name: "My shared view", shared: true },
        { channels: {}, name: "Peer view", shared: true, author: "other-user" },
      ],
      channelIds: [],
    });
    render(<ViewsControl />);
    expect(screen.getByText("My views")).toBeInTheDocument();
    expect(screen.getByText("Shared by me")).toBeInTheDocument();
    expect(screen.getByText("Shared with me")).toBeInTheDocument();
    expect(screen.getByText("Local view")).toBeInTheDocument();
    expect(screen.getByText("My shared view")).toBeInTheDocument();
    expect(screen.getByText("Peer view")).toBeInTheDocument();
  });

  test("hides 'Shared by me' section when no own shared views exist", () => {
    setupStore({
      layersStates: [
        { channels: {}, name: "Local view" },
        { channels: {}, name: "Peer view", shared: true, author: "other-user" },
      ],
      channelIds: [],
    });
    render(<ViewsControl />);
    expect(screen.getByText("My views")).toBeInTheDocument();
    expect(screen.queryByText("Shared by me")).not.toBeInTheDocument();
    expect(screen.getByText("Shared with me")).toBeInTheDocument();
  });

  test("fork action on peer view calls forkView with correct index", () => {
    setupStore({
      layersStates: [
        { channels: {}, name: "Local view" },
        { channels: {}, name: "Peer view", shared: true, author: "other-user" },
      ],
      channelIds: [],
    });
    render(<ViewsControl />);
    fireEvent.click(screen.getByRole("button", { name: "Actions for view 2" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Copy to my views" }));
    expect(mockForkView).toHaveBeenCalledWith(1);
  });

  test("peer view context menu does not show Rename or Delete", () => {
    setupStore({
      layersStates: [
        { channels: {}, name: "Local view" },
        { channels: {}, name: "Peer view", shared: true, author: "other-user" },
      ],
      channelIds: [],
    });
    render(<ViewsControl />);
    fireEvent.click(screen.getByRole("button", { name: "Actions for view 2" }));
    expect(screen.getByRole("menuitem", { name: "Copy to my views" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Rename" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete view" })).not.toBeInTheDocument();
  });

  test("own view context menu shows Share and Rename and Delete", () => {
    setupStore({
      layersStates: [{ channels: {}, name: "My view" }],
      channelIds: [],
    });
    render(<ViewsControl />);
    fireEvent.click(screen.getByRole("button", { name: "Actions for view 1" }));
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Share" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete view" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Copy to my views" })).not.toBeInTheDocument();
  });
});
