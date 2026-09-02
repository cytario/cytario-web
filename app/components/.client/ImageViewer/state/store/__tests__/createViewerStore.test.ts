import { getSelectionStats } from "../../../utils/getSelectionStats";
import { createViewerStore } from "../createViewerStore";
import { getInitialChannelsState } from "../getInitialChannelsState";
import { Image, Loader } from "../ome.tif.types";
import {
  ChannelConfig,
  ChannelsStateColumns,
  OverlaysState,
  PresetChannelConfig,
  ViewState,
} from "../types";
import { createMigrate } from "~/utils/persistMigration";

vi.mock("../../../utils/getSelectionStats");
vi.mock("../getInitialChannelsState");

const createMockLayersState = () => ({
  id: crypto.randomUUID(),
  author: "",
  shared: false,
  channels: {} as Record<string, Partial<PresetChannelConfig>>,
  overlays: {} as OverlaysState,
  channelsOpacity: 1,
  overlaysFillOpacity: 0.8,
  showCellOutline: true,
  annotationsOpacity: 1,
  showAnnotationOutline: true,
  isChannelsLoading: 0,
  isOverlaysLoading: 0,
  name: undefined as string | undefined,
});

const createMockChannels = () => ({
  Red: {
    isInitialized: true,
    isLoading: false,
    isVisible: true,
    selection: { c: 0, x: 0, y: 0, z: 0, t: 0 },
    domain: [0, 255] as const,
    histogram: new Array(256).fill(0),
    contrastLimits: [10, 200] as [number, number],
    color: [255, 0, 0] as [number, number, number],
  } as ChannelConfig,
  Green: {
    isInitialized: false,
    isLoading: false,
    isVisible: false,
    selection: { c: 1, x: 0, y: 0, z: 0, t: 0 },
    domain: [0, 65535] as const,
    histogram: new Array(256).fill(0),
    contrastLimits: [0, 65535] as [number, number],
    color: [0, 255, 0] as [number, number, number],
  } as ChannelConfig,
});

describe("createViewerStore", () => {
  test("should create a store with initial state", () => {
    const storeId = "test-viewer-1";
    const store = createViewerStore(storeId);

    const initialState = store.getState();

    expect(initialState).toEqual({
      id: storeId,
      currentUserId: "",
      error: null,
      selectedChannelId: null,
      loader: [],
      valueRange: [0, 0],
      isViewerLoading: true,
      metadata: null,
      viewStatePreview: null,
      viewStateActive: null,
      imagePanelIndex: -1,
      imagePanels: [],
      channels: {},
      channelIds: [],
      cursorPosition: null,
      pixelValues: {},
      compositeTooltip: null,
      hoverMode: "compact",
      pinnedTooltip: null,
      annotationSets: [],
      activeSetId: null,
      annotationMode: "view",
      annotationSelectedIds: [],
      annotationView: {},
      annotationActiveClass: null,
      annotationClasses: [],
      layersStates: [],
      setError: expect.any(Function),
      setCursorPosition: expect.any(Function),
      setPixelValues: expect.any(Function),
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
      setActivePresetIndex: expect.any(Function),
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
      setViewName: expect.any(Function),
      seedAnnotations: expect.any(Function),
      ensureOwnSet: expect.any(Function),
      updateSetFeatures: expect.any(Function),
      deleteAnnotationSet: expect.any(Function),
      renameAnnotationSet: expect.any(Function),
      setAnnotationClassColor: expect.any(Function),
      setAnnotationClassForIds: expect.any(Function),
      renameAnnotationClass: expect.any(Function),
      renameAnnotation: expect.any(Function),
      setAnnotationActiveClass: expect.any(Function),
      createAnnotationClass: expect.any(Function),
      deleteAnnotationClass: expect.any(Function),
      setAnnotationsOpacity: expect.any(Function),
      setShowAnnotationOutline: expect.any(Function),
      setAnnotationSetHidden: expect.any(Function),
      toggleAnnotationClassVisibility: expect.any(Function),
      showAnnotationClass: expect.any(Function),
      setAnnotationMode: expect.any(Function),
      setAnnotationSelectedIds: expect.any(Function),
      shareView: expect.any(Function),
      unshareView: expect.any(Function),
      forkView: expect.any(Function),
      loadSharedViews: expect.any(Function),
      setCompositeTooltip: expect.any(Function),
      setHoverMode: expect.any(Function),
      pinTooltip: expect.any(Function),
      unpinTooltip: expect.any(Function),
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
      { type: "zarr", url: "http://example.com/data.zarr", dtype: "Uint16" },
      { type: "tiff", url: "http://example.com/data.tiff" },
    ] as unknown as Loader;

    expect(store.getState().loader).toEqual([]);
    expect(store.getState().valueRange).toEqual([0, 0]);

    store.getState().setLoader(mockLoader);
    expect(store.getState().loader).toEqual(mockLoader);
    // valueRange derived from the loader's pixel dtype (16-bit → 65535)
    expect(store.getState().valueRange).toEqual([0, 65535]);

    const newLoader = [{ type: "czi", url: "http://example.com/data.czi" }] as unknown as Loader;

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

  test("addImagePanel() clones active panel's preset", () => {
    const store = createViewerStore("test-viewer-11b");

    const preset0 = createMockLayersState();
    preset0.channelsOpacity = 0.3;

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [preset0, createMockLayersState()],
    });

    store.getState().addImagePanel();

    expect(store.getState().imagePanels).toEqual([0, 2]);
    expect(store.getState().layersStates).toHaveLength(3);
    expect(store.getState().layersStates[2].channelsOpacity).toBe(0.3);
  });

  test("addImagePanel() with shared presets clones the active panel's preset", () => {
    const store = createViewerStore("test-viewer-11c");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0, 0],
      layersStates: [createMockLayersState()],
    });

    store.getState().addImagePanel();

    expect(store.getState().imagePanels).toEqual([0, 0, 1]);
    expect(store.getState().layersStates).toHaveLength(2);
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

  test("removeChannelsState() decrements panels above removed preset", () => {
    const store = createViewerStore("test-viewer-16b");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0, 1, 2],
      layersStates: [createMockLayersState(), createMockLayersState(), createMockLayersState()],
    });

    store.getState().removeChannelsState(1);

    expect(store.getState().layersStates).toHaveLength(2);
    expect(store.getState().imagePanels).toEqual([0, 0, 1]);
  });

  test("removeChannelsState() remaps panels on removed preset to 0", () => {
    const store = createViewerStore("test-viewer-16c");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [1, 0, 1],
      layersStates: [createMockLayersState(), createMockLayersState(), createMockLayersState()],
    });

    store.getState().removeChannelsState(1);

    expect(store.getState().layersStates).toHaveLength(2);
    expect(store.getState().imagePanels).toEqual([0, 0, 0]);
  });

  test("removeChannelsState() does nothing when only one preset remains", () => {
    const store = createViewerStore("test-viewer-16d");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [createMockLayersState()],
    });

    store.getState().removeChannelsState(0);

    expect(store.getState().layersStates).toHaveLength(1);
    expect(store.getState().imagePanels).toEqual([0]);
  });

  test("setActivePresetIndex()", () => {
    const store = createViewerStore("test-viewer-17");
    const layersState1 = createMockLayersState();
    const layersState2 = createMockLayersState();

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      layersStates: [layersState1, layersState2],
    });

    store.getState().setActivePresetIndex(1);
    expect(store.getState().imagePanels[0]).toBe(1);
  });

  test("setContrastLimits()", () => {
    const store = createViewerStore("test-viewer-18");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      selectedChannelId: "Red",
      channels: createMockChannels(),
      layersStates: [createMockLayersState()],
    });

    store.getState().setContrastLimits([50, 150]);
    expect(store.getState().layersStates[0].channels["Red"].contrastLimits).toEqual([50, 150]);
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

    const mockLayers = createMockLayersState();
    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      selectedChannelId: "Red",
      layersStates: [mockLayers],
      channels: createMockChannels(),
      channelIds: ["Red", "Green"],
    });

    // First change the contrast limits
    store.getState().setContrastLimits([50, 150]);
    expect(store.getState().layersStates[0].channels["Red"].contrastLimits).toEqual([50, 150]);

    // Then reset them
    store.getState().resetContrastLimits();
    expect(store.getState().layersStates[0].channels["Red"].contrastLimits).toEqual([10, 200]);
  });

  test("setChannelVisibility() for initialized channel", async () => {
    const store = createViewerStore("test-viewer-20");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      loader: [{}] as unknown as Loader,
      channels: createMockChannels(),
      layersStates: [createMockLayersState()],
    });

    await store.getState().setChannelVisibility("Red" as keyof ChannelsStateColumns, false);
    expect(store.getState().layersStates[0].channels["Red"].isVisible).toBe(false);

    await store.getState().setChannelVisibility("Red" as keyof ChannelsStateColumns, true);
    expect(store.getState().layersStates[0].channels["Red"].isVisible).toBe(true);
  });

  test("setChannelVisibility() does nothing without loader", async () => {
    const store = createViewerStore("test-viewer-20b");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      loader: null,
      layersStates: [createMockLayersState()],
    });

    await store.getState().setChannelVisibility("Red" as keyof ChannelsStateColumns, false);
    // Should not throw and should not create channel entries
    expect(store.getState().layersStates[0].channels["Red"]).toBeUndefined();
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
      channels: createMockChannels(),
      layersStates: [createMockLayersState()],
    });

    expect(store.getState().channels["Green"].isInitialized).toBe(false);

    await store.getState().setChannelVisibility("Green" as keyof ChannelsStateColumns, true);

    expect(store.getState().channels["Green"].isInitialized).toBe(true);
    expect(store.getState().layersStates[0].channels["Green"].isVisible).toBe(true);
    expect(store.getState().channels["Green"].domain).toEqual([0, 1000]);
    expect(store.getState().layersStates[0].channels["Green"].contrastLimits).toEqual([50, 800]);
  });

  test("setChannelVisibility() handles initialization error", async () => {
    const store = createViewerStore("test-viewer-20d");

    vi.mocked(getSelectionStats).mockRejectedValue(new Error("Load failed"));

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      loader: [{}] as unknown as Loader,
      channels: createMockChannels(),
      layersStates: [createMockLayersState()],
    });

    await store.getState().setChannelVisibility("Green" as keyof ChannelsStateColumns, true);

    // Should set loading to false and visibility to false on error
    expect(store.getState().channels["Green"].isLoading).toBe(false);
    expect(store.getState().layersStates[0].channels["Green"].isVisible).toBe(false);
  });

  test("setChannelColor()", () => {
    const store = createViewerStore("test-viewer-21");

    store.setState({
      imagePanelIndex: 0,
      imagePanels: [0],
      channels: createMockChannels(),
      layersStates: [createMockLayersState()],
    });

    store.getState().setChannelColor("Red", [0, 128, 255, 255]);
    expect(store.getState().layersStates[0].channels["Red"].color).toEqual([0, 128, 255]);
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

    expect(store.getState().layersStates[0].overlays["file1.json"]["marker1"].isVisible).toBe(true);

    store.getState().setMarkerVisibility("file1.json", "marker1", false);
    expect(store.getState().layersStates[0].overlays["file1.json"]["marker1"].isVisible).toBe(
      false,
    );
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
    expect(store.getState().layersStates[0].overlays["file1.json"]["marker1"].color).toEqual([
      0, 255, 0, 255,
    ]);
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
    expect(store.getState().layersStates[0].overlays["file1.json"]).toEqual(updatedOverlay);
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
    expect(store.getState().layersStates[0].overlays["file1.json"]).toBeUndefined();
    expect(store.getState().layersStates[0].overlays["file2.json"]).toBeDefined();
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
    test("does nothing when metadata is null", () => {
      const store = createViewerStore("test-viewer-29");

      store.setState({
        metadata: null,
        loader: [{}] as unknown as Loader,
      });

      store.getState().addChannelsState();
      expect(store.getState().layersStates).toEqual([]);
    });

    test("does nothing when loader is null", () => {
      const store = createViewerStore("test-viewer-30");

      store.setState({
        metadata: { Pixels: { Channels: [] } } as unknown as Image,
        loader: null,
      });

      store.getState().addChannelsState();
      expect(store.getState().layersStates).toEqual([]);
    });

    test("initializes channels state on first call", () => {
      const store = createViewerStore("test-viewer-31");

      const mockChannelsState = {
        DAPI: {
          isInitialized: false,
          isLoading: false,
          isVisible: false,
          selection: { c: 0, x: 0, y: 0, z: 0, t: 0 },
          domain: [0, 65535] as const,
          histogram: new Array(256).fill(0),
          contrastLimits: [0, 65535] as [number, number],
          color: [0, 0, 255] as [number, number, number],
        },
      };

      vi.mocked(getInitialChannelsState).mockReturnValue({
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

      store.getState().addChannelsState();

      expect(store.getState().imagePanelIndex).toBe(0);
      expect(store.getState().imagePanels).toEqual([0]);
      expect(store.getState().selectedChannelId).toBe("DAPI");
      expect(store.getState().layersStates).toHaveLength(1);
      expect(store.getState().channelIds).toEqual(["DAPI"]);
    });

    test("creates fresh default preset on subsequent calls", () => {
      const store = createViewerStore("test-viewer-33");

      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        metadata: { Pixels: { Channels: [] } } as unknown as Image,
        loader: [{}] as unknown as Loader,
        layersStates: [createMockLayersState()],
      });

      store.getState().addChannelsState();

      expect(store.getState().layersStates).toHaveLength(2);
      expect(store.getState().imagePanels[0]).toBe(1);
    });

    test("new preset has defaults, not a copy of the active preset", () => {
      const store = createViewerStore("test-viewer-33b");

      const modifiedState = createMockLayersState();
      modifiedState.channels = { Red: { contrastLimits: [50, 150], color: [1, 2, 3] } };
      modifiedState.channelsOpacity = 0.5;
      modifiedState.showCellOutline = false;

      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        metadata: { Pixels: { Channels: [] } } as unknown as Image,
        loader: [{}] as unknown as Loader,
        channelIds: ["Red", "Green", "Blue"],
        channels: createMockChannels(),
        layersStates: [modifiedState],
      });

      store.getState().addChannelsState();

      const newPreset = store.getState().layersStates[1];
      expect(newPreset.channels).toEqual({
        Red: { isVisible: true },
      });
      expect(newPreset.channelsOpacity).toBe(1);
      expect(newPreset.showCellOutline).toBe(true);
      expect(newPreset.overlaysFillOpacity).toBe(0.8);
      expect(newPreset.annotationsOpacity).toBe(1);
    });
  });

  describe("setViewName()", () => {
    test("sets a custom name on a view", () => {
      const store = createViewerStore("test-viewer-34");
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [createMockLayersState()],
      });

      store.getState().setViewName(0, "My View");
      expect(store.getState().layersStates[0].name).toBe("My View");
    });

    test("clearing the name sets it to undefined", () => {
      const store = createViewerStore("test-viewer-35");
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [{ ...createMockLayersState(), name: "Custom" }],
      });

      store.getState().setViewName(0, null);
      expect(store.getState().layersStates[0].name).toBeUndefined();
    });

    test("empty string also clears the name", () => {
      const store = createViewerStore("test-viewer-36");
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [{ ...createMockLayersState(), name: "Custom" }],
      });

      store.getState().setViewName(0, "");
      expect(store.getState().layersStates[0].name).toBeUndefined();
    });

    test("whitespace-only string clears the name", () => {
      const store = createViewerStore("test-viewer-37");
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [{ ...createMockLayersState(), name: "Custom" }],
      });

      store.getState().setViewName(0, "   ");
      expect(store.getState().layersStates[0].name).toBeUndefined();
    });

    test("does nothing for out-of-bounds index", () => {
      const store = createViewerStore("test-viewer-38");
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [createMockLayersState()],
      });

      store.getState().setViewName(5, "Invalid");
      store.getState().setViewName(-1, "Invalid");
      expect(store.getState().layersStates).toHaveLength(1);
      expect(store.getState().layersStates[0].name).toBeUndefined();
    });
  });

  describe("shareView()", () => {
    test("sets shared=true on own view", () => {
      const store = createViewerStore("test-share-1", "user-a");
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [{ ...createMockLayersState(), author: "user-a" }],
      });

      store.getState().shareView(0);
      expect(store.getState().layersStates[0].shared).toBe(true);
    });

    test("does nothing for peer-authored view", () => {
      const store = createViewerStore("test-share-2", "user-a");
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [{ ...createMockLayersState(), author: "user-b", shared: false }],
      });

      store.getState().shareView(0);
      expect(store.getState().layersStates[0].shared).toBe(false);
    });

    test("does nothing for out-of-bounds index", () => {
      const store = createViewerStore("test-share-4", "user-a");
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [{ ...createMockLayersState(), author: "user-a" }],
      });

      store.getState().shareView(5);
      store.getState().shareView(-1);
      expect(store.getState().layersStates[0].shared).toBe(false);
    });
  });

  describe("unshareView()", () => {
    test("sets shared=false on own view", () => {
      const store = createViewerStore("test-unshare-1", "user-a");
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [{ ...createMockLayersState(), author: "user-a", shared: true }],
      });

      store.getState().unshareView(0);
      expect(store.getState().layersStates[0].shared).toBe(false);
    });

    test("entry remains in layersStates after unshare", () => {
      const store = createViewerStore("test-unshare-2", "user-a");
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [{ ...createMockLayersState(), author: "user-a", shared: true }],
      });

      store.getState().unshareView(0);
      expect(store.getState().layersStates).toHaveLength(1);
    });

    test("does nothing for peer-authored view", () => {
      const store = createViewerStore("test-unshare-3", "user-a");
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [{ ...createMockLayersState(), author: "user-b", shared: true }],
      });

      store.getState().unshareView(0);
      expect(store.getState().layersStates[0].shared).toBe(true);
    });
  });

  describe("forkView()", () => {
    test("clones view with new UUID, current user as author, shared=false", () => {
      const store = createViewerStore("test-fork-1", "user-a");
      const source = {
        ...createMockLayersState(),
        author: "user-b",
        shared: true,
        name: "Peer View",
      };
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [source],
      });

      store.getState().forkView(0);

      expect(store.getState().layersStates).toHaveLength(2);
      const fork = store.getState().layersStates[1];
      expect(fork.id).not.toBe(source.id);
      expect(fork.author).toBe("user-a");
      expect(fork.shared).toBe(false);
      expect(fork.name).toBe("Peer View (copy)");
      expect(fork.channels).toEqual(source.channels);
      expect(fork.overlays).toEqual(source.overlays);
    });

    test("forked view has unique id across multiple forks", () => {
      const store = createViewerStore("test-fork-2", "user-a");
      const source = {
        ...createMockLayersState(),
        author: "user-b",
        shared: true,
        name: "Shared",
      };
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [source],
      });

      store.getState().forkView(0);
      store.getState().forkView(0);

      expect(store.getState().layersStates).toHaveLength(3);
      const ids = store.getState().layersStates.map((ls) => ls.id);
      expect(new Set(ids).size).toBe(3);
    });

    test("fork of unnamed view produces unnamed clone", () => {
      const store = createViewerStore("test-fork-3", "user-a");
      const source = {
        ...createMockLayersState(),
        author: "user-b",
        shared: true,
      };
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [source],
      });

      store.getState().forkView(0);
      expect(store.getState().layersStates[1].name).toBeUndefined();
    });

    test("does nothing for out-of-bounds index", () => {
      const store = createViewerStore("test-fork-4", "user-a");
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [{ ...createMockLayersState(), author: "user-b" }],
      });

      store.getState().forkView(5);
      store.getState().forkView(-1);
      expect(store.getState().layersStates).toHaveLength(1);
    });
  });

  describe("loadSharedViews()", () => {
    test("appends new shared views", () => {
      const store = createViewerStore("test-load-1", "user-a");
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [{ ...createMockLayersState(), author: "user-a" }],
      });

      const entries = [
        {
          id: "shared-1",
          author: "user-b",
          name: "Peer View",
          shared: true,
          channels: {},
          channelsOpacity: 1,
          overlays: {},
          overlaysFillOpacity: 0.8,
          showCellOutline: true,
          annotationsOpacity: 1,
          showAnnotationOutline: true,
        },
      ];

      store.getState().loadSharedViews(entries);
      expect(store.getState().layersStates).toHaveLength(2);
      expect(store.getState().layersStates[1].id).toBe("shared-1");
      expect(store.getState().layersStates[1].author).toBe("user-b");
      expect(store.getState().layersStates[1].shared).toBe(true);
    });

    test("overwrites existing view by id instead of duplicating", () => {
      const store = createViewerStore("test-load-2", "user-a");
      const existing = {
        ...createMockLayersState(),
        id: "view-1",
        author: "user-b",
        shared: true,
        name: "Old Name",
        channelsOpacity: 0.5,
      };
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [existing],
      });

      const entries = [
        {
          id: "view-1",
          author: "user-b",
          name: "New Name",
          shared: true,
          channels: {},
          channelsOpacity: 1,
          overlays: {},
          overlaysFillOpacity: 0.8,
          showCellOutline: true,
          annotationsOpacity: 1,
          showAnnotationOutline: true,
        },
      ];

      store.getState().loadSharedViews(entries);
      expect(store.getState().layersStates).toHaveLength(1);
      expect(store.getState().layersStates[0].name).toBe("New Name");
      expect(store.getState().layersStates[0].channelsOpacity).toBe(1);
    });

    test("does nothing with empty entries", () => {
      const store = createViewerStore("test-load-3", "user-a");
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [{ ...createMockLayersState(), author: "user-a" }],
      });

      store.getState().loadSharedViews([]);
      expect(store.getState().layersStates).toHaveLength(1);
    });

    test("handles mix of new and existing ids", () => {
      const store = createViewerStore("test-load-4", "user-a");
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [
          { ...createMockLayersState(), id: "existing-1", author: "user-a" },
          {
            ...createMockLayersState(),
            id: "shared-1",
            author: "user-b",
            shared: true,
            name: "Old",
          },
        ],
      });

      const entries = [
        {
          id: "shared-1",
          author: "user-b",
          name: "Updated",
          shared: true,
          channels: {},
          channelsOpacity: 1,
          overlays: {},
          overlaysFillOpacity: 0.8,
          showCellOutline: true,
          annotationsOpacity: 1,
          showAnnotationOutline: true,
        },
        {
          id: "shared-2",
          author: "user-c",
          name: "New Peer View",
          shared: true,
          channels: {},
          channelsOpacity: 1,
          overlays: {},
          overlaysFillOpacity: 0.8,
          showCellOutline: true,
          annotationsOpacity: 1,
          showAnnotationOutline: true,
        },
      ];

      store.getState().loadSharedViews(entries);
      expect(store.getState().layersStates).toHaveLength(3);
      expect(store.getState().layersStates[1].name).toBe("Updated");
      expect(store.getState().layersStates[2].id).toBe("shared-2");
    });
  });

  describe("setViewName() peer guard", () => {
    test("does not rename a peer-authored view", () => {
      const store = createViewerStore("test-setname-peer-1", "user-a");
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [{ ...createMockLayersState(), author: "user-b", name: "Original" }],
      });

      store.getState().setViewName(0, "Hacked");
      expect(store.getState().layersStates[0].name).toBe("Original");
    });
  });

  describe("removeChannelsState() peer guard", () => {
    test("does not remove a peer-authored view", () => {
      const store = createViewerStore("test-remove-peer-1", "user-a");
      const peerView = { ...createMockLayersState(), author: "user-b" };
      const ownView = { ...createMockLayersState(), author: "user-a" };
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0, 1],
        layersStates: [peerView, ownView],
      });

      store.getState().removeChannelsState(0);
      expect(store.getState().layersStates).toHaveLength(2);
    });

    test("removes own view normally", () => {
      const store = createViewerStore("test-remove-peer-2", "user-a");
      const ownView1 = { ...createMockLayersState(), author: "user-a" };
      const ownView2 = { ...createMockLayersState(), author: "user-a" };
      store.setState({
        imagePanelIndex: 0,
        imagePanels: [0, 1],
        layersStates: [ownView1, ownView2],
      });

      store.getState().removeChannelsState(0);
      expect(store.getState().layersStates).toHaveLength(1);
    });
  });

  describe("persist migration v0 -> v1", () => {
    const fallback = {
      selectedChannelId: null,
      imagePanelIndex: -1,
      imagePanels: [],
      layersStates: [],
      viewStateActive: null,
    };

    const migrate = createMigrate(
      {
        0: (state) => {
          const s = state as Record<string, unknown>;
          return {
            selectedChannelId: null,
            imagePanelIndex: -1,
            imagePanels: [],
            layersStates: [],
            viewStateActive: s?.viewStateActive ?? null,
          };
        },
      },
      fallback,
    );

    test("clears layersStates and resets panel state from v0", () => {
      const v0State = {
        selectedChannelId: "Red",
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [createMockLayersState()],
        viewStateActive: { zoom: -2, target: [100, 200] },
      };

      const result = migrate(v0State, 0);

      expect(result).toEqual({
        selectedChannelId: null,
        imagePanelIndex: -1,
        imagePanels: [],
        layersStates: [],
        viewStateActive: { zoom: -2, target: [100, 200] },
      });
    });

    test("preserves viewStateActive from v0", () => {
      const viewState = {
        zoom: -3,
        width: 1920,
        height: 1080,
        target: [500, 500],
        rotationX: 0,
        rotationOrbit: 0,
      };

      const result = migrate({ viewStateActive: viewState }, 0);
      expect(result.viewStateActive).toEqual(viewState);
    });

    test("handles null viewStateActive in v0", () => {
      const result = migrate({}, 0);
      expect(result.viewStateActive).toBeNull();
    });

    test("handles null persisted state", () => {
      const result = migrate(null, 0);
      expect(result.viewStateActive).toBeNull();
      expect(result.layersStates).toEqual([]);
    });

    test("returns state unchanged when already at v1", () => {
      const v1State = {
        selectedChannelId: "Blue",
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [createMockLayersState()],
        viewStateActive: null,
      };

      const result = migrate(v1State, 1);
      expect(result).toEqual(v1State);
    });
  });

  describe("persist migration v3 -> v4 (clear stale state)", () => {
    const fallback = {
      selectedChannelId: null,
      imagePanelIndex: -1,
      imagePanels: [],
      layersStates: [],
      channels: {},
      channelIds: [],
      viewStateActive: null,
    };

    const migrate = createMigrate(
      {
        3: (state) => state,
        4: () => fallback,
      },
      fallback,
    );

    test("clears all persisted state from v3", () => {
      const v3State = {
        selectedChannelId: "Red",
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [
          {
            channels: {
              Red: {
                isInitialized: true,
                isVisible: true,
                contrastLimits: [50, 150],
                contrastLimitsInitial: [10, 200],
                domain: [0, 255],
                color: [255, 0, 0],
                histogram: [],
                selection: { c: 0, x: 0, y: 0, z: 0, t: 0 },
                isLoading: false,
              },
            },
            channelIds: ["Red"],
          },
        ],
        viewStateActive: null,
      };

      const result = migrate(v3State, 3);

      expect(result).toEqual(fallback);
    });
  });

  describe("persist migration v4 -> v5 (per-user sidecar model)", () => {
    const fallback = {
      currentUserId: "",
      selectedChannelId: null,
      imagePanelIndex: -1,
      imagePanels: [],
      layersStates: [],
      channels: {},
      channelIds: [],
      viewStateActive: null,
      annotationClasses: [],
      annotationActiveClass: null,
    };

    const migrate = createMigrate(
      {
        4: (state) => state,
        5: () => fallback,
      },
      fallback,
    );

    test("drops all old presets from v4 (they lack author field)", () => {
      const v4State = {
        currentUserId: "user-1",
        selectedChannelId: "Red",
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [
          {
            id: "old-preset",
            shared: false,
            channels: {},
            overlays: {},
            channelsOpacity: 1,
            overlaysFillOpacity: 0.8,
            showCellOutline: true,
            annotationsOpacity: 1,
            showAnnotationOutline: true,
            isChannelsLoading: 0,
            isOverlaysLoading: 0,
          },
        ],
        channels: {},
        channelIds: ["Red"],
        viewStateActive: null,
        annotationClasses: [],
        annotationActiveClass: null,
      };

      const result = migrate(v4State, 4);

      expect(result).toEqual(fallback);
      expect(result.layersStates).toEqual([]);
    });
  });
});
