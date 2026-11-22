import { describe, expect, test } from "vitest";

import { createViewerStore } from "../../../state/store/createViewerStore";
import { planExport, legendForPanel } from "../planExport";

const seedStore = () => {
  const store = createViewerStore("conn-1/images/slide.ome.tif", "user-a");
  store.setState({
    viewStateActive: {
      zoom: 0,
      width: 800,
      height: 600,
      rotationX: 0,
      rotationOrbit: 0,
      target: [512, 512],
      minRotationX: -90,
      maxRotationX: 90,
      minZoom: -1,
      maxZoom: 2,
      transitionDuration: 0,
    },
    metadata: {
      ID: "",
      Name: "slide",
      Pixels: {
        Type: "Uint8",
        Channels: [],
        SizeX: 1024,
        SizeY: 1024,
        PhysicalSizeX: 0.25,
        PhysicalSizeY: 0.25,
        PhysicalSizeXUnit: "µm",
        PhysicalSizeYUnit: "µm",
        PhysicalSizeZ: 1,
        PhysicalSizeZUnit: "µm",
      },
    },
    channels: {
      DAPI: {
        selection: { c: 0, x: 0, y: 0, z: 0, t: 0 },
        domain: [0, 255],
        histogram: new Array(256).fill(0),
        isInitialized: true,
        isLoading: false,
        isVisible: true,
        contrastLimits: [0, 255],
        color: [0, 255, 0],
      },
    },
    channelIds: ["DAPI", "FITC"],
    imagePanels: [0],
    imagePanelIndex: 0,
    layersStates: [
      {
        id: "view-1",
        author: "user-a",
        channels: {
          // DAPI on with its color, FITC off — the legend must list exactly the
          // visible channel, resolved through the per-preset merge.
          DAPI: { isVisible: true, contrastLimits: [0, 255], color: [0, 255, 0] },
          FITC: { isVisible: false, contrastLimits: [0, 255], color: [255, 0, 0] },
        },
        overlays: {},
        channelsOpacity: 1,
        overlaysFillOpacity: 0.8,
        showCellOutline: true,
        annotationsOpacity: 0.5,
        showAnnotationOutline: true,
        isChannelsLoading: 0,
        isOverlaysLoading: 0,
      },
    ],
  });
  return store;
};

const QUICK_SHARE = {
  id: "quick-share",
  name: "Quick share",
  dpi: 180,
  displayWidthInches: 6.7,
  targetWidthPx: 1200,
} as const;

const LIMITS = { maxCanvasSide: 16384, areaLimit: 16384 * 16384 };

describe("planExport", () => {
  test("legend items come from the per-preset channel visibility", () => {
    const store = seedStore();

    // The top-level channels carry image data only (no isVisible) — the
    // legend must resolve visibility through the panel's merged
    // channelsState, or it is always empty.
    expect(legendForPanel(store.getState(), 0)).toEqual({
      channels: [{ name: "DAPI", color: [0, 255, 0] }],
      overlays: [],
    });
  });

  test("a current-view plan exports the on-screen rectangle at the preset's width", () => {
    const store = seedStore();

    const plan = planExport({ store, preset: QUICK_SHARE, limits: LIMITS });

    // 800 × 600 CSS px at zoom 0 around [512, 512].
    expect(plan.frame.bounds).toEqual([112, 212, 912, 812]);
    expect(plan.frame.width).toBe(1200);
    expect(plan.frame.height).toBe(900);
    // The deck is the output's size; its zoom maps the rectangle onto it.
    expect(plan.viewState.width).toBe(1200);
    expect(plan.viewState.height).toBe(900);
    expect(plan.viewState.zoom).toBeCloseTo(Math.log2(1200 / 800), 10);
    expect(plan.viewState.target).toEqual([512, 512]);
    expect(plan.metadata.Name).toBe("slide");
    // Quick share: 7 pt at 180 DPI = 17.5 px against the viewer's 12 px.
    expect(plan.pixelScale).toBeCloseTo(17.5 / 12, 10);
  });

  test("a region plan exports exactly the region at the region's own aspect", () => {
    const store = seedStore();
    store.setState({
      annotationSets: [
        {
          id: "set-1",
          createdBy: "user-a",
          name: "Regions",
          features: [
            {
              type: "Feature",
              id: "rect-1",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [100, 100],
                    [600, 100],
                    [600, 1100],
                    [100, 1100],
                    [100, 100],
                  ],
                ],
              },
              properties: { name: "Tall" },
            },
          ],
        },
      ],
    });

    const plan = planExport({
      store,
      preset: QUICK_SHARE,
      regionFeatureId: "rect-1",
      limits: LIMITS,
    });

    // The 500 × 1000 region, no margin — tall, though the panel is wide.
    expect(plan.frame.bounds).toEqual([100, 100, 600, 1100]);
    expect(plan.frame.width).toBe(1000);
    expect(plan.frame.height).toBe(2000);
    expect(plan.frame.upscaled).toBe(true);
    expect(plan.viewState.target).toEqual([350, 600]);
  });

  test("an unknown region fails the plan", () => {
    expect(() =>
      planExport({ store: seedStore(), preset: QUICK_SHARE, regionFeatureId: "missing" }),
    ).toThrow("no longer available");
  });

  test("legend includes visible overlay markers with their colors", () => {
    const store = seedStore();
    store.setState((state) => {
      state.layersStates[0].overlays = {
        "overlay-1": {
          markers: {
            markerA: { isVisible: true, color: [255, 0, 0], label: "Marker A" },
            markerB: { isVisible: false, color: [0, 0, 255], label: "Marker B" },
          },
        },
      } as never;
    });

    expect(legendForPanel(store.getState(), 0)).toEqual({
      channels: [{ name: "DAPI", color: [0, 255, 0] }],
      overlays: [{ name: "Marker A", color: [255, 0, 0] }],
    });
  });

  describe("the legend describes the view a panel shows, not the view at the panel's index", () => {
    const secondView = {
      id: "view-2",
      author: "user-a",
      channels: {
        DAPI: { isVisible: false, contrastLimits: [0, 255], color: [0, 255, 0] },
        FITC: { isVisible: true, contrastLimits: [0, 255], color: [255, 0, 255] },
      },
      overlays: {
        "overlay-1": {
          markers: { markerC: { isVisible: true, color: [0, 128, 255], label: "Marker C" } },
        },
      },
      channelsOpacity: 1,
      overlaysFillOpacity: 0.8,
      showCellOutline: true,
      annotationsOpacity: 0.5,
      showAnnotationOutline: true,
      isChannelsLoading: 0,
      isOverlaysLoading: 0,
    };
    const store = seedStore();
    store.setState((state) => {
      state.layersStates.push(secondView as never);
      state.channels.FITC = { ...state.channels.DAPI, selection: { c: 1, x: 0, y: 0, z: 0, t: 0 } };
    });
    const secondViewLegend = {
      channels: [{ name: "FITC", color: [255, 0, 255] }],
      overlays: [{ name: "Marker C", color: [0, 128, 255] }],
    };

    test("a single panel showing the second view", () => {
      store.setState({ imagePanels: [1], imagePanelIndex: 0 });
      expect(legendForPanel(store.getState(), 0)).toEqual(secondViewLegend);
    });

    test("a split view whose panels show the views swapped", () => {
      store.setState({ imagePanels: [1, 0], imagePanelIndex: 1 });
      expect(legendForPanel(store.getState(), 0)).toEqual(secondViewLegend);
      expect(legendForPanel(store.getState(), 1)).toEqual({
        channels: [{ name: "DAPI", color: [0, 255, 0] }],
        overlays: [],
      });
    });
  });

  test("the plan pins the active panel, so deck and legend resolve the same one", () => {
    const store = seedStore();
    store.setState({ imagePanels: [0, 0], imagePanelIndex: 1 });
    const plan = planExport({ store, preset: QUICK_SHARE, limits: LIMITS });
    expect(plan.imagePanelId).toBe(1);
  });
});
