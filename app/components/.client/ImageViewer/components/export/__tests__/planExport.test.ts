import { describe, expect, test } from "vitest";

import { createViewerStore } from "../../../state/store/createViewerStore";
import { planExport } from "../planExport";

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

describe("planExport", () => {
  test("legend items come from the per-preset channel visibility", () => {
    const store = seedStore();

    const plan = planExport({
      store,
      preset: {
        id: "presentation",
        name: "Presentation (300 DPI)",
        dpi: 300,
        displayWidthInches: 6.7,
        targetWidthPx: 2000,
      },
    });

    // The top-level channels carry image data only (no isVisible) — the plan
    // must resolve visibility through the panel's merged channelsState, or the
    // legend is always empty.
    expect(plan.legendItems).toEqual([{ name: "DAPI", color: [0, 255, 0] }]);
  });

  test("the plan frames the current view lifted to the preset's pixel width", () => {
    const store = seedStore();

    const plan = planExport({
      store,
      preset: {
        id: "web",
        name: "Web (90 DPI)",
        dpi: 90,
        displayWidthInches: 6.7,
        targetWidthPx: 600,
      },
    });

    // 600 px target from an 800 px viewport: scale 0.75, floored to 1.
    expect(plan.devicePixels).toBe(1);
    expect(plan.viewState.width).toBe(800);
    expect(plan.metadata?.Name).toBe("slide");
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

    const plan = planExport({
      store,
      preset: {
        id: "web",
        name: "Web (90 DPI)",
        dpi: 90,
        displayWidthInches: 6.7,
        targetWidthPx: 600,
      },
    });

    expect(plan.legendItems).toEqual([
      { name: "DAPI", color: [0, 255, 0] },
      { name: "Marker A", color: [255, 0, 0] },
    ]);
  });
});
