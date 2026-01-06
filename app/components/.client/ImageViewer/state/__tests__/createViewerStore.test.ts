import { getSelectionStats } from "../../utils/getSelectionStats";
import { createViewerStore } from "../createViewerStore";
import { getInitialChannelsState } from "../getInitialChannelsState";
import { Image, Loader } from "../ome.tif.types";
import {
  ChannelConfig,
  ChannelsStateColumns,
  OverlaysState,
  ViewState,
} from "../types";

vi.mock("../../utils/getSelectionStats");
vi.mock("../getInitialChannelsState");

const createMockLayersState = () => ({
  channels: {
    Red: {
      isInitialized: true,
      isLoading: false,
      isVisible: true,
      selection: { c: 0, x: 0, y: 0, z: 0, t: 0 },
      domain: [0, 255] as const,
      histogram: [],
      contrastLimitsInitial: [10, 200] as const,
      contrastLimits: [10, 200] as [number, number],
      color: [255, 0, 0] as [number, number, number],
    } as ChannelConfig,
    Green: {
      isInitialized: false,
      isLoading: false,
      isVisible: false,
      selection: { c: 1, x: 0, y: 0, z: 0, t: 0 },
      domain: [0, 65535] as const,
      histogram: [],
      contrastLimitsInitial: [0, 65535] as const,
      contrastLimits: [0, 65535] as [number, number],
      color: [0, 255, 0] as [number, number, number],
    } as ChannelConfig,
  },
  channelIds: ["Red", "Green"],
  overlays: {} as OverlaysState,
  channelsOpacity: 1,
  overlaysFillOpacity: 0.8,
  showCellOutline: true,
  isChannelsLoading: 0,
  isOverlaysLoading: 0,
});

describe("createViewerStore", () => {
  test("should create a store with initial state", () => {
    const storeId = "test-viewer-1";
    const store = createViewerStore(storeId);

    const initialState = store.getState();

    expect(initialState).toEqual({
      id: storeId,
      error: null,
      selectedChannelId: null,
      loader: [],
      isViewerLoading: true,
      metadata: null,
      viewStatePreview: null,
      viewStateActive: null,
      imagePanelIndex: -1,
      imagePanels: [],
      cursorPosition: null,
      layersStates: [],
      setError: expect.any(Function),
      setCursorPosition: expect.any(Function),
      setViewStatePreview: expect.any(Function),
      setViewStateActive: expect.any(Function),
      setIsViewerLoading: expect.any(Function),
      setIsChannelsLoading: expect.any(Function),
      setIsOverlaysLoading: expect.any(Function),
      setMetadata: expect.any(Function),
      setLoader: expect.any(Function),
      setSelectedChannelId: expect.any(Function),
      setActiveImagePanelId: expect.any(Function),
      addImagePanel: expect.any(Function),
      addChannelsState: expect.any(Function),
      removeChannelsState: expect.any(Function),
      setActiveChannelsStateIndex: expect.any(Function),
      removeImagePanel: expect.any(Function),
      setContrastLimits: expect.any(Function),
      resetContrastLimits: expect.any(Function),
      setChannelVisibility: expect.any(Function),
      setChannelColor: expect.any(Function),
      addOverlaysState: expect.any(Function),
      removeOverlaysState: expect.any(Function),
      setMarkerVisibility: expect.any(Function),
      setMarkerColor: expect.any(Function),
      updateOverlaysState: expect.any(Function),
      setOverlaysFillOpacity: expect.any(Function),
      setChannelsOpacity: expect.any(Function),
      setShowCellOutline: expect.any(Function),
    });
  });

  test("setError()", () => {
    const store = createViewerStore("test-viewer-2");
    const testError = new Error("Test error");

    expect(store.getState().error).toBeNull();

    store.getState().setError(testError);
    expect(store.getState().error).toBe(testError);

    store.getState().setError(null);
    expect(store.getState().error).toBeNull();
  });

  test("setCursorPosition()", () => {
    const store = createViewerStore("test-viewer-2b");

    expect(store.getState().cursorPosition).toBeNull();

    const position1 = { x: 100, y: 200 };
    store.getState().setCursorPosition(position1);
    expect(store.getState().cursorPosition).toEqual(position1);

    const position2 = { x: 300, y: 400 };
    store.getState().setCursorPosition(position2);
    expect(store.getState().cursorPosition).toEqual(position2);

    store.getState().setCursorPosition(null);
    expect(store.getState().cursorPosition).toBeNull();
  });

  test("setViewStatePreview()", () => {
    const store = createViewerStore("test-viewer-3");
    const mockViewState = {
      zoom: 2,
      target: [100, 200],
    } as unknown as ViewState;

    expect(store.getState().viewStatePreview).toBeNull();

    store.getState().setViewStatePreview(mockViewState);
    expect(store.getState().viewStatePreview).toEqual(mockViewState);

    const newViewState = {
      zoom: 3,
      target: [150, 250],
    } as unknown as ViewState;

    store.getState().setViewStatePreview(newViewState);
    expect(store.getState().viewStatePreview).toEqual(newViewState);
  });

  test("setViewStateActive()", () => {
    const store = createViewerStore("test-viewer-4");
    const mockViewState = {
      zoom: 1.5,
      target: [75, 125],
    } as unknown as ViewState;

    expect(store.getState().viewStateActive).toBeNull();

    store.getState().setViewStateActive(mockViewState);
    expect(store.getState().viewStateActive).toEqual(mockViewState);

    const newViewState = {
      zoom: 4,
      target: [200, 300],
    } as unknown as ViewState;

    store.getState().setViewStateActive(newViewState);
    expect(store.getState().viewStateActive).toEqual(newViewState);
  });

  test("setIsViewerLoading()", () => {
    const store = createViewerStore("test-viewer-5");

    expect(store.getState().isViewerLoading).toBe(true);

    store.getState().setIsViewerLoading(false);
    expect(store.getState().isViewerLoading).toBe(false);

    store.getState().setIsViewerLoading(true);
    expect(store.getState().isViewerLoading).toBe(true);
  });

  test("setMetadata()", () => {
    const store = createViewerStore("test-viewer-7");
    const mockMetadata = {
      name: "test-image.tiff",
      shape: [1024, 1024, 3],
      dtype: "uint8",
    } as unknown as Image;

    expect(store.getState().metadata).toBeNull();

    store.getState().setMetadata(mockMetadata);
    expect(store.getState().metadata).toEqual(mockMetadata);

    const newMetadata = {
      name: "another-image.zarr",
      shape: [2048, 2048, 5],
      dtype: "uint16",
    } as unknown as Image;

    store.getState().setMetadata(newMetadata);
    expect(store.getState().metadata).toEqual(newMetadata);
  });

  test("setLoader()", () => {
    const store = createViewerStore("test-viewer-8");
    const mockLoader = [
      { type: "zarr", url: "http://example.com/data.zarr" },
      { type: "tiff", url: "http://example.com/data.tiff" },
    ] as unknown as Loader;

    expect(store.getState().loader).toEqual([]);

    store.getState().setLoader(mockLoader);
    expect(store.getState().loader).toEqual(mockLoader);

    const newLoader = [
      { type: "czi", url: "http://example.com/data.czi" },
    ] as unknown as Loader;

    store.getState().setLoader(newLoader);
    expect(store.getState().loader).toEqual(newLoader);
  });

  test("setSelectedChannelId()", () => {
    const store = createViewerStore("test-viewer-9");

    expect(store.getState().selectedChannelId).toBeNull();

    store.getState().setSelectedChannelId("Red");
    expect(store.getState().selectedChannelId).toBe("Red");

    store.getState().setSelectedChannelId("Green");
    expect(store.getState().selectedChannelId).toBe("Green");

    store.getState().setSelectedChannelId(null);
    expect(store.getState().selectedChannelId).toBeNull();
  });

  test("setActiveImagePanelId()", () => {
    const store = createViewerStore("test-viewer-10");

    expect(store.getState().imagePanelIndex).toBe(-1);

    store.getState().setActiveImagePanelId(0);
    expect(store.getState().imagePanelIndex).toBe(0);

    store.getState().setActiveImagePanelId(2);
    expect(store.getState().imagePanelIndex).toBe(2);

    store.getState().setActiveImagePanelId(-1);
    expect(store.getState().imagePanelIndex).toBe(-1);
  });

  test("addImagePanel()", () => {
    const store = createViewerStore("test-viewer-11");

    expect(store.getState().imagePanels).toEqual([]);

    store.getState().addImagePanel();
    expect(store.getState().imagePanels).toEqual([0]);

    store.getState().addImagePanel();
    expect(store.getState().imagePanels).toEqual([0, 1]);

    store.getState().addImagePanel();
    expect(store.getState().imagePanels).toEqual([0, 1, 2]);
  });

  test("removeImagePanel()", () => {
    const store = createViewerStore("test-viewer-13");

    store.setState({
      imagePanelIndex: 2,
      imagePanels: [0, 1, 2, 3],
    });

    expect(store.getState().imagePanels).toEqual([0, 1, 2, 3]);
    expect(store.getState().imagePanelIndex).toBe(2);

    store.getState().removeImagePanel(1);
    expect(store.getState().imagePanels).toEqual([0, 2, 3]);
    expect(store.getState().imagePanelIndex).toBe(0);

    store.getState().removeImagePanel(0);
    expect(store.getState().imagePanels).toEqual([2, 3]);
    expect(store.getState().imagePanelIndex).toBe(-1);
  });

  test("setIsChannelsLoading()", () => {
    const store = createViewerStore("test-viewer-14");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [createMockLayersState()],
    });

    expect(store.getState().layersStates[0].isChannelsLoading).toBe(0);

    store.getState().setIsChannelsLoading(0, 3);
    expect(store.getState().layersStates[0].isChannelsLoading).toBe(3);

    store.getState().setIsChannelsLoading(0, 0);
    expect(store.getState().layersStates[0].isChannelsLoading).toBe(0);
  });

  test("setIsChannelsLoading() does nothing when layer doesn't exist", () => {
    const store = createViewerStore("test-viewer-14b");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [],
    });

    // Should not throw
    store.getState().setIsChannelsLoading(0, 3);
    expect(store.getState().layersStates).toEqual([]);
  });

  test("setIsOverlaysLoading()", () => {
    const store = createViewerStore("test-viewer-15");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [createMockLayersState()],
    });

    expect(store.getState().layersStates[0].isOverlaysLoading).toBe(0);

    store.getState().setIsOverlaysLoading(0, 5);
    expect(store.getState().layersStates[0].isOverlaysLoading).toBe(5);

    store.getState().setIsOverlaysLoading(0, 0);
    expect(store.getState().layersStates[0].isOverlaysLoading).toBe(0);
  });

  test("removeChannelsState()", () => {
    const store = createViewerStore("test-viewer-16");
    const layersState1 = createMockLayersState();
    const layersState2 = createMockLayersState();

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0, 1],
      layersStates: [layersState1, layersState2],
    });

    expect(store.getState().layersStates).toHaveLength(2);

    store.getState().removeChannelsState(0);
    expect(store.getState().layersStates).toHaveLength(1);
  });

  test("setActiveChannelsStateIndex()", () => {
    const store = createViewerStore("test-viewer-17");
    const layersState1 = createMockLayersState();
    const layersState2 = createMockLayersState();

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [layersState1, layersState2],
    });

    store.getState().setActiveChannelsStateIndex(1);
    expect(store.getState().imagePanels[0]).toBe(1);
  });

  test("setActiveChannelsStateIndex() duplicates last state when needed", () => {
    const store = createViewerStore("test-viewer-17b");
    const layersState = createMockLayersState();

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [layersState],
    });

    // Request index 2, which doesn't exist yet
    store.getState().setActiveChannelsStateIndex(2);

    // Should have duplicated layers states to reach index 2
    expect(store.getState().layersStates).toHaveLength(3);
    expect(store.getState().imagePanels[0]).toBe(2);
  });

  test("setContrastLimits()", () => {
    const store = createViewerStore("test-viewer-18");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      selectedChannelId: "Red",
      layersStates: [createMockLayersState()],
    });

    expect(
      store.getState().layersStates[0].channels["Red"].contrastLimits
    ).toEqual([10, 200]);

    store.getState().setContrastLimits([50, 150]);
    expect(
      store.getState().layersStates[0].channels["Red"].contrastLimits
    ).toEqual([50, 150]);
  });

  test("setContrastLimits() does nothing when channel doesn't exist", () => {
    const store = createViewerStore("test-viewer-18b");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      selectedChannelId: "NonExistent",
      layersStates: [createMockLayersState()],
    });

    // Should not throw
    store.getState().setContrastLimits([50, 150]);
  });

  test("resetContrastLimits()", () => {
    const store = createViewerStore("test-viewer-19");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      selectedChannelId: "Red",
      layersStates: [createMockLayersState()],
    });

    // First change the contrast limits
    store.getState().setContrastLimits([50, 150]);
    expect(
      store.getState().layersStates[0].channels["Red"].contrastLimits
    ).toEqual([50, 150]);

    // Then reset them
    store.getState().resetContrastLimits();
    expect(
      store.getState().layersStates[0].channels["Red"].contrastLimits
    ).toEqual([10, 200]);
  });

  test("setChannelVisibility() for initialized channel", async () => {
    const store = createViewerStore("test-viewer-20");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      loader: [{}] as unknown as Loader,
      layersStates: [createMockLayersState()],
    });

    expect(store.getState().layersStates[0].channels["Red"].isVisible).toBe(
      true
    );

    await store
      .getState()
      .setChannelVisibility("Red" as keyof ChannelsStateColumns, false);
    expect(store.getState().layersStates[0].channels["Red"].isVisible).toBe(
      false
    );

    await store
      .getState()
      .setChannelVisibility("Red" as keyof ChannelsStateColumns, true);
    expect(store.getState().layersStates[0].channels["Red"].isVisible).toBe(
      true
    );
  });

  test("setChannelVisibility() does nothing without loader", async () => {
    const store = createViewerStore("test-viewer-20b");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      loader: null,
      layersStates: [createMockLayersState()],
    });

    await store
      .getState()
      .setChannelVisibility("Red" as keyof ChannelsStateColumns, false);
    // Should remain unchanged
    expect(store.getState().layersStates[0].channels["Red"].isVisible).toBe(
      true
    );
  });

  test("setChannelVisibility() initializes uninitialized channel", async () => {
    const store = createViewerStore("test-viewer-20c");

    vi.mocked(getSelectionStats).mockResolvedValue({
      domain: [0, 1000],
      contrastLimits: [50, 800],
      histogram: new Array(256).fill(1),
    });

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      loader: [{}] as unknown as Loader,
      layersStates: [createMockLayersState()],
    });

    expect(
      store.getState().layersStates[0].channels["Green"].isInitialized
    ).toBe(false);

    await store
      .getState()
      .setChannelVisibility("Green" as keyof ChannelsStateColumns, true);

    expect(
      store.getState().layersStates[0].channels["Green"].isInitialized
    ).toBe(true);
    expect(store.getState().layersStates[0].channels["Green"].isVisible).toBe(
      true
    );
    expect(store.getState().layersStates[0].channels["Green"].domain).toEqual([
      0, 1000,
    ]);
    expect(
      store.getState().layersStates[0].channels["Green"].contrastLimits
    ).toEqual([50, 800]);
  });

  test("setChannelVisibility() handles initialization error", async () => {
    const store = createViewerStore("test-viewer-20d");

    vi.mocked(getSelectionStats).mockRejectedValue(new Error("Load failed"));

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      loader: [{}] as unknown as Loader,
      layersStates: [createMockLayersState()],
    });

    await store
      .getState()
      .setChannelVisibility("Green" as keyof ChannelsStateColumns, true);

    // Should set loading to false and visibility to false on error
    expect(store.getState().layersStates[0].channels["Green"].isLoading).toBe(
      false
    );
    expect(store.getState().layersStates[0].channels["Green"].isVisible).toBe(
      false
    );
  });

  test("setChannelColor()", () => {
    const store = createViewerStore("test-viewer-21");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [createMockLayersState()],
    });

    expect(store.getState().layersStates[0].channels["Red"].color).toEqual([
      255, 0, 0,
    ]);

    store.getState().setChannelColor("Red", [0, 128, 255, 255]);
    expect(store.getState().layersStates[0].channels["Red"].color).toEqual([
      0, 128, 255,
    ]);
  });

  test("setMarkerVisibility()", () => {
    const store = createViewerStore("test-viewer-22");

    const layersState = createMockLayersState();
    layersState.overlays = {
      "file1.json": {
        marker1: { color: [255, 0, 0, 255], count: 10, isVisible: true },
      },
    };

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [layersState],
    });

    expect(
      store.getState().layersStates[0].overlays["file1.json"]["marker1"]
        .isVisible
    ).toBe(true);

    store.getState().setMarkerVisibility("file1.json", "marker1", false);
    expect(
      store.getState().layersStates[0].overlays["file1.json"]["marker1"]
        .isVisible
    ).toBe(false);
  });

  test("setMarkerColor()", () => {
    const store = createViewerStore("test-viewer-23");

    const layersState = createMockLayersState();
    layersState.overlays = {
      "file1.json": {
        marker1: { color: [255, 0, 0, 255], count: 10, isVisible: true },
      },
    };

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [layersState],
    });

    store.getState().setMarkerColor("file1.json", "marker1", [0, 255, 0, 255]);
    expect(
      store.getState().layersStates[0].overlays["file1.json"]["marker1"].color
    ).toEqual([0, 255, 0, 255]);
  });

  test("addOverlaysState()", () => {
    const store = createViewerStore("test-viewer-24");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [createMockLayersState()],
    });

    const newOverlay: OverlaysState = {
      "newFile.json": {
        newMarker: { color: [0, 0, 255, 255], count: 5, isVisible: true },
      },
    };

    store.getState().addOverlaysState(newOverlay);
    expect(store.getState().layersStates[0].overlays["newFile.json"]).toEqual({
      newMarker: { color: [0, 0, 255, 255], count: 5, isVisible: true },
    });
  });

  test("updateOverlaysState()", () => {
    const store = createViewerStore("test-viewer-25");

    const layersState = createMockLayersState();
    layersState.overlays = {
      "file1.json": {
        marker1: { color: [255, 0, 0, 255], count: 10, isVisible: true },
      },
    };

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [layersState],
    });

    const updatedOverlay = {
      marker1: {
        color: [0, 255, 0, 255] as [number, number, number, number],
        count: 20,
        isVisible: false,
      },
      marker2: {
        color: [0, 0, 255, 255] as [number, number, number, number],
        count: 15,
        isVisible: true,
      },
    };

    store.getState().updateOverlaysState("file1.json", updatedOverlay);
    expect(store.getState().layersStates[0].overlays["file1.json"]).toEqual(
      updatedOverlay
    );
  });

  test("removeOverlaysState()", () => {
    const store = createViewerStore("test-viewer-26");

    const layersState = createMockLayersState();
    layersState.overlays = {
      "file1.json": {
        marker1: { color: [255, 0, 0, 255], count: 10, isVisible: true },
      },
      "file2.json": {
        marker2: { color: [0, 255, 0, 255], count: 5, isVisible: true },
      },
    };

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [layersState],
    });

    store.getState().removeOverlaysState("file1.json");
    expect(
      store.getState().layersStates[0].overlays["file1.json"]
    ).toBeUndefined();
    expect(
      store.getState().layersStates[0].overlays["file2.json"]
    ).toBeDefined();
  });

  test.each([
    {
      name: "setOverlaysFillOpacity",
      setter: "setOverlaysFillOpacity" as const,
      property: "overlaysFillOpacity" as const,
      initial: 0.8,
      values: [0.5, 1],
    },
    {
      name: "setChannelsOpacity",
      setter: "setChannelsOpacity" as const,
      property: "channelsOpacity" as const,
      initial: 1,
      values: [0.7, 0.3],
    },
  ])("$name()", ({ setter, property, initial, values }) => {
    const store = createViewerStore(`test-opacity-${setter}`);

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [createMockLayersState()],
    });

    expect(store.getState().layersStates[0][property]).toBe(initial);

    store.getState()[setter](values[0]);
    expect(store.getState().layersStates[0][property]).toBe(values[0]);

    store.getState()[setter](values[1]);
    expect(store.getState().layersStates[0][property]).toBe(values[1]);
  });

  test("setShowCellOutline()", () => {
    const store = createViewerStore("test-viewer-28b");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [createMockLayersState()],
    });

    expect(store.getState().layersStates[0].showCellOutline).toBe(true);

    store.getState().setShowCellOutline(false);
    expect(store.getState().layersStates[0].showCellOutline).toBe(false);

    store.getState().setShowCellOutline(true);
    expect(store.getState().layersStates[0].showCellOutline).toBe(true);
  });

  test("setShowCellOutline() only affects active panel", () => {
    const store = createViewerStore("test-viewer-28c");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0, 1],
      layersStates: [createMockLayersState(), createMockLayersState()],
    });

    // Both panels start with showCellOutline = true
    expect(store.getState().layersStates[0].showCellOutline).toBe(true);
    expect(store.getState().layersStates[1].showCellOutline).toBe(true);

    // Toggle panel 0's outline off
    store.getState().setShowCellOutline(false);
    expect(store.getState().layersStates[0].showCellOutline).toBe(false);
    expect(store.getState().layersStates[1].showCellOutline).toBe(true);

    // Switch to panel 1 and toggle its outline off
    store.setState({ imagePanelIndex: 1 });
    store.getState().setShowCellOutline(false);
    expect(store.getState().layersStates[0].showCellOutline).toBe(false);
    expect(store.getState().layersStates[1].showCellOutline).toBe(false);

    // Switch back to panel 0 and toggle it on - panel 1 should stay off
    store.setState({ imagePanelIndex: 0 });
    store.getState().setShowCellOutline(true);
    expect(store.getState().layersStates[0].showCellOutline).toBe(true);
    expect(store.getState().layersStates[1].showCellOutline).toBe(false);
  });

  describe("addChannelsState()", () => {
    test("does nothing when metadata is null", async () => {
      const store = createViewerStore("test-viewer-29");

      store.setState({
        metadata: null,
        loader: [{}] as unknown as Loader,
      });

      await store.getState().addChannelsState();
      expect(store.getState().layersStates).toEqual([]);
    });

    test("does nothing when loader is null", async () => {
      const store = createViewerStore("test-viewer-30");

      store.setState({
        metadata: { Pixels: { Channels: [] } } as unknown as Image,
        loader: null,
      });

      await store.getState().addChannelsState();
      expect(store.getState().layersStates).toEqual([]);
    });

    test("initializes channels state on first call", async () => {
      const store = createViewerStore("test-viewer-31");

      const mockChannelsState = {
        DAPI: {
          isInitialized: true,
          isLoading: false,
          isVisible: true,
          selection: { c: 0, x: 0, y: 0, z: 0, t: 0 },
          domain: [0, 65535] as const,
          histogram: [],
          contrastLimitsInitial: [0, 65535] as const,
          contrastLimits: [0, 65535] as [number, number],
          color: [0, 0, 255] as [number, number, number],
        },
      };

      vi.mocked(getInitialChannelsState).mockResolvedValue({
        channelsState: mockChannelsState,
        channelIds: ["DAPI"],
        firstChannelKey: "DAPI",
      });

      store.setState({
        imagePanelIndex: -1,
        metadata: {
          Pixels: { Channels: [{ Name: "DAPI" }] },
        } as unknown as Image,
        loader: [{}] as unknown as Loader,
      });

      await store.getState().addChannelsState();

      expect(store.getState().imagePanelIndex).toBe(0);
      expect(store.getState().imagePanels).toEqual([0]);
      expect(store.getState().selectedChannelId).toBe("DAPI");
      expect(store.getState().layersStates).toHaveLength(1);
      expect(store.getState().layersStates[0].channelIds).toEqual(["DAPI"]);
    });

    test("sets error state when initialization fails", async () => {
      const store = createViewerStore("test-viewer-32");
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      vi.mocked(getInitialChannelsState).mockRejectedValue(
        new Error("Failed to load channels")
      );

      store.setState({
        imagePanelIndex: -1,
        metadata: { Pixels: { Channels: [] } } as unknown as Image,
        loader: [{}] as unknown as Loader,
      });

      await store.getState().addChannelsState();

      expect(store.getState().error).toBeInstanceOf(Error);
      expect(store.getState().error?.message).toBe("Failed to load channels");
      consoleSpy.mockRestore();
    });

    test("sets error state for non-Error thrown values", async () => {
      const store = createViewerStore("test-viewer-32b");
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      vi.mocked(getInitialChannelsState).mockRejectedValue("String error");

      store.setState({
        imagePanelIndex: -1,
        metadata: { Pixels: { Channels: [] } } as unknown as Image,
        loader: [{}] as unknown as Loader,
      });

      await store.getState().addChannelsState();

      expect(store.getState().error).toBeInstanceOf(Error);
      expect(store.getState().error?.message).toBe("String error");
      consoleSpy.mockRestore();
    });

    test("duplicates current channel state on subsequent calls", async () => {
      const store = createViewerStore("test-viewer-33");

      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        metadata: { Pixels: { Channels: [] } } as unknown as Image,
        loader: [{}] as unknown as Loader,
        layersStates: [createMockLayersState()],
      });

      await store.getState().addChannelsState();

      expect(store.getState().layersStates).toHaveLength(2);
      expect(store.getState().imagePanels[0]).toBe(1);
    });
  });
});
