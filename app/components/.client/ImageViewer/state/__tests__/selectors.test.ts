import { select } from "../selectors";
import { ViewerStore } from "../types";

describe("selectors", () => {
  const createMockState = (
    overrides: Partial<ViewerStore> = {}
  ): ViewerStore => ({
    id: "test",
    error: null,
    selectedChannelId: null,
    loader: [],
    isViewerLoading: false,
    metadata: null,
    viewStatePreview: null,
    viewStateActive: null,
    imagePanelIndex: 0,
    imagePanels: [0],
    cursorPosition: null,
    layersStates: [
      {
        channels: {
          Red: {
            isInitialized: true,
            isLoading: false,
            isVisible: true,
            selection: { c: 0, x: 0, y: 0, z: 0, t: 0 },
            domain: [0, 255],
            histogram: [],
            contrastLimitsInitial: [0, 255],
            contrastLimits: [0, 255],
            color: [255, 0, 0],
          },
          Green: {
            isInitialized: true,
            isLoading: false,
            isVisible: true,
            selection: { c: 1, x: 0, y: 0, z: 0, t: 0 },
            domain: [0, 65535],
            histogram: [],
            contrastLimitsInitial: [0, 65535],
            contrastLimits: [0, 65535],
            color: [0, 255, 0],
          },
          Blue: {
            isInitialized: true,
            isLoading: false,
            isVisible: false,
            selection: { c: 2, x: 0, y: 0, z: 0, t: 0 },
            domain: [0, 1000],
            histogram: [],
            contrastLimitsInitial: [0, 1000],
            contrastLimits: [0, 1000],
            color: [0, 0, 255],
          },
        },
        channelIds: ["Red", "Green", "Blue"],
        overlays: {},
        channelsOpacity: 1,
        overlaysFillOpacity: 0.8,
        isChannelsLoading: 0,
        isOverlaysLoading: 0,
      },
    ],
    // Mock action functions
    setError: vi.fn(),
    setCursorPosition: vi.fn(),
    setViewStatePreview: vi.fn(),
    setViewStateActive: vi.fn(),
    setIsViewerLoading: vi.fn(),
    setIsChannelsLoading: vi.fn(),
    setIsOverlaysLoading: vi.fn(),
    setMetadata: vi.fn(),
    setLoader: vi.fn(),
    setSelectedChannelId: vi.fn(),
    setActiveImagePanelId: vi.fn(),
    addImagePanel: vi.fn(),
    addChannelsState: vi.fn(),
    removeChannelsState: vi.fn(),
    setActiveChannelsStateIndex: vi.fn(),
    removeImagePanel: vi.fn(),
    setContrastLimits: vi.fn(),
    resetContrastLimits: vi.fn(),
    setChannelVisibility: vi.fn(),
    setMarkerVisibility: vi.fn(),
    setChannelColor: vi.fn(),
    setMarkerColor: vi.fn(),
    addOverlaysState: vi.fn(),
    updateOverlaysState: vi.fn(),
    removeOverlaysState: vi.fn(),
    setOverlaysFillOpacity: vi.fn(),
    setChannelsOpacity: vi.fn(),
    ...overrides,
  });

  describe("channelIds", () => {
    test("returns channel ids from current layer state", () => {
      const state = createMockState();
      expect(select.channelIds(state)).toEqual(["Red", "Green", "Blue"]);
    });

    test("returns empty array when no layer state exists", () => {
      const state = createMockState({
        imagePanelIndex: -1,
        imagePanels: [],
        layersStates: [],
      });
      expect(select.channelIds(state)).toEqual([]);
    });

    test("returns empty array when imagePanelIndex is out of bounds", () => {
      const state = createMockState({
        imagePanelIndex: 5,
        imagePanels: [0],
      });
      expect(select.channelIds(state)).toEqual([]);
    });
  });

  describe("maxChannelDomain", () => {
    test("returns the maximum domain value across all channels", () => {
      const state = createMockState();
      // Green has domain [0, 65535] which is the max
      expect(select.maxChannelDomain(state)).toBe(65535);
    });

    test("returns 0 when no channels exist", () => {
      const state = createMockState({
        imagePanelIndex: 0,
        imagePanels: [0],
        layersStates: [
          {
            channels: {},
            channelIds: [],
            overlays: {},
            channelsOpacity: 1,
            overlaysFillOpacity: 0.8,
            isChannelsLoading: 0,
            isOverlaysLoading: 0,
          },
        ],
      });
      expect(select.maxChannelDomain(state)).toBe(-Infinity);
    });

    test("handles single channel correctly", () => {
      const state = createMockState({
        layersStates: [
          {
            channels: {
              Single: {
                isInitialized: true,
                isLoading: false,
                isVisible: true,
                selection: { c: 0, x: 0, y: 0, z: 0, t: 0 },
                domain: [0, 4096],
                histogram: [],
                contrastLimitsInitial: [0, 4096],
                contrastLimits: [0, 4096],
                color: [255, 255, 255],
              },
            },
            channelIds: ["Single"],
            overlays: {},
            channelsOpacity: 1,
            overlaysFillOpacity: 0.8,
            isChannelsLoading: 0,
            isOverlaysLoading: 0,
          },
        ],
      });
      expect(select.maxChannelDomain(state)).toBe(4096);
    });
  });

  describe("visibleChannelCount", () => {
    test("returns count of visible channels", () => {
      const state = createMockState();
      // Red and Green are visible, Blue is not
      expect(select.visibleChannelCount(state)).toBe(2);
    });

    test("returns 0 when no channels are visible", () => {
      const state = createMockState({
        layersStates: [
          {
            channels: {
              Red: {
                isInitialized: true,
                isLoading: false,
                isVisible: false,
                selection: { c: 0, x: 0, y: 0, z: 0, t: 0 },
                domain: [0, 255],
                histogram: [],
                contrastLimitsInitial: [0, 255],
                contrastLimits: [0, 255],
                color: [255, 0, 0],
              },
            },
            channelIds: ["Red"],
            overlays: {},
            channelsOpacity: 1,
            overlaysFillOpacity: 0.8,
            isChannelsLoading: 0,
            isOverlaysLoading: 0,
          },
        ],
      });
      expect(select.visibleChannelCount(state)).toBe(0);
    });

    test("returns correct count when all channels are visible", () => {
      const state = createMockState({
        layersStates: [
          {
            channels: {
              Ch1: {
                isInitialized: true,
                isLoading: false,
                isVisible: true,
                selection: { c: 0, x: 0, y: 0, z: 0, t: 0 },
                domain: [0, 255],
                histogram: [],
                contrastLimitsInitial: [0, 255],
                contrastLimits: [0, 255],
                color: [255, 0, 0],
              },
              Ch2: {
                isInitialized: true,
                isLoading: false,
                isVisible: true,
                selection: { c: 1, x: 0, y: 0, z: 0, t: 0 },
                domain: [0, 255],
                histogram: [],
                contrastLimitsInitial: [0, 255],
                contrastLimits: [0, 255],
                color: [0, 255, 0],
              },
              Ch3: {
                isInitialized: true,
                isLoading: false,
                isVisible: true,
                selection: { c: 2, x: 0, y: 0, z: 0, t: 0 },
                domain: [0, 255],
                histogram: [],
                contrastLimitsInitial: [0, 255],
                contrastLimits: [0, 255],
                color: [0, 0, 255],
              },
            },
            channelIds: ["Ch1", "Ch2", "Ch3"],
            overlays: {},
            channelsOpacity: 1,
            overlaysFillOpacity: 0.8,
            isChannelsLoading: 0,
            isOverlaysLoading: 0,
          },
        ],
      });
      expect(select.visibleChannelCount(state)).toBe(3);
    });

    test("returns 0 when no layer state exists", () => {
      const state = createMockState({
        imagePanelIndex: -1,
        imagePanels: [],
        layersStates: [],
      });
      expect(select.visibleChannelCount(state)).toBe(0);
    });
  });
});
