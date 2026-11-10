import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("~/utils/db/getTileDataWasm", () => ({
  readAllAnnotations: vi.fn().mockResolvedValue([]),
}));

const deckInstances: {
  isInitialized: boolean;
  canvas: HTMLCanvasElement;
  finalize: ReturnType<typeof vi.fn>;
}[] = [];

vi.mock("@deck.gl/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@deck.gl/core")>();
  class FakeDeck {
    isInitialized = true;
    canvas: HTMLCanvasElement;
    finalize = vi.fn();
    constructor() {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      this.canvas = canvas;
      deckInstances.push(this);
    }
  }
  return { ...actual, Deck: FakeDeck };
});

vi.mock("../buildChannelsLayerConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../buildChannelsLayerConfig")>();
  return {
    ...actual,
    buildChannelsLayer: vi.fn(() => ({ isLoaded: true, id: "channels-0" })),
  };
});

vi.mock("../buildOverlaysLayers", () => ({
  buildOverlaysLayers: vi.fn(() => []),
  overlayPanelInputs: vi.fn(() => ({ overlayState: null })),
}));

vi.mock("../../components/canvas/Overlays/OverlayComposite", () => ({
  OVERLAY_COMPOSITE_LAYER_ID: "overlays-composite",
  OverlayCompositeLayer: class {
    isLoaded = true;
    id = "overlays-composite";
    constructor() {}
  },
  OverlayCompositeEffect: class {
    id = "overlay-composite-effect";
    props = {};
    constructor() {}
  },
}));

import { commitExportAnnotation } from "../../components/export/commitExportAnnotation";
import { GESTURE_DEBOUNCE_MS } from "../../state/store/core/viewerTemporal";
import { createViewerStore } from "../../state/store/createViewerStore";
import { exportView, type ExportViewResult } from "../exportView";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

const regionFeature: AnnotationFeature = {
  type: "Feature",
  id: "region-1",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [100, 200],
        [356, 200],
        [356, 344],
        [100, 344],
        [100, 200],
      ],
    ],
  },
  properties: { name: "Tumor core" },
};

const exportResult = (filename: string): ExportViewResult => ({
  blob: new Blob(["png"], { type: "image/png" }),
  filename,
  width: 320,
  height: 240,
  clamped: false,
  upscaled: false,
});

let store: ReturnType<typeof createViewerStore>;

const seedStore = () => {
  store = createViewerStore("conn-1/images/slide.ome.tif", "user-a");
  store.setState({
    currentUserId: "user-a",
    metadata: {
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
    viewStateActive: {
      zoom: 0,
      width: 320,
      height: 240,
      rotationX: 0,
      rotationOrbit: 0,
      target: [228, 272],
      minRotationX: -90,
      maxRotationX: 90,
      minZoom: -1,
      maxZoom: 2,
      transitionDuration: 0,
    },
    loader: [
      {
        shape: [1, 1, 1024, 1024],
        dtype: "Uint8",
        labels: ["t", "c", "y", "x"],
        tileSize: 256,
        getTile: async () => ({ data: new Uint8Array(16), width: 4, height: 4 }),
        getRaster: async () => ({ data: new Uint8Array(16), width: 4, height: 4 }),
      },
    ],
    imagePanels: [0],
    imagePanelIndex: 0,
    layersStates: [
      {
        id: "view-1",
        author: "user-a",
        channels: {},
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
    channelIds: ["DAPI"],
    annotationSets: [
      { id: "own-set", createdBy: "user-a", name: "Own", features: [regionFeature] },
    ],
    activeSetId: "own-set",
  });
};

const emptyOptions = {
  source: { kind: "current-view" as const },
  scale: 1,
  aspect: "as-viewed" as const,
  decorations: {
    scaleBar: false,
    magnification: false,
    channelLabels: false,
    annotationRegions: false,
    caption: false,
  },
  destination: "download" as const,
  imageBasename: "slide",
};

describe("provenance export annotation", () => {
  beforeEach(() => {
    deckInstances.length = 0;
    seedStore();
  });

  test("commits a rectangle of the exported extent, named from the captured filename", () => {
    const before = store.getState().annotationSets[0].features.length;

    commitExportAnnotation(
      store,
      "own-set",
      exportResult("slide_2025-01-07-130509.png"),
      regionFeature,
    );

    const set = store.getState().annotationSets[0];
    expect(set.features).toHaveLength(before + 1);

    const created = set.features[set.features.length - 1];
    expect(created.properties?.name).toBe("slide_2025-01-07-130509");
    expect(created.geometry.type).toBe("Polygon");
    // Exactly the exported level-0 extent: the source region's bounds.
    expect(created.geometry.coordinates[0]).toEqual([
      [100, 200],
      [356, 200],
      [356, 344],
      [100, 344],
      [100, 200],
    ]);
    // Auto-selected like any drawn region.
    expect(store.getState().annotationSelectedIds).toEqual([created.id]);
  });

  test("the commit enters the undo history (temporal)", async () => {
    // The temporal middleware's gesture cool-off absorbs bursts; let the seed's
    // window lapse so the export commit is recorded as its own undo step.
    await new Promise((resolve) => setTimeout(resolve, GESTURE_DEBOUNCE_MS + 50));

    const temporalStore = (
      store as unknown as {
        temporal?: { getState: () => { pastStates: unknown[] } };
      }
    ).temporal;
    const before = temporalStore?.getState().pastStates.length ?? 0;

    commitExportAnnotation(
      store,
      "own-set",
      exportResult("slide_2025-01-07-130509.png"),
      regionFeature,
    );

    const after = temporalStore?.getState().pastStates.length ?? 0;
    expect(after).toBe(before + 1);

    // Undo restores the set without the provenance region.
    (
      store as unknown as {
        temporal?: { getState: () => { undo: () => void } };
      }
    ).temporal
      ?.getState()
      .undo();
    expect(store.getState().annotationSets[0].features).toHaveLength(1);
  });

  test(
    "exportView renders off-screen through a fresh Deck and finalizes it",
    { timeout: 10_000 },
    async () => {
      const blob = new Blob(["png"], { type: "image/png" });
      const toBlob = vi
        .spyOn(HTMLCanvasElement.prototype, "toBlob")
        .mockImplementation((callback: (blob: Blob | null) => void) => {
          callback(blob);
          return undefined;
        });
      // happy-dom provides no real 2D context — stub the drawing calls out.
      const context = {
        canvas: { width: 320, height: 240 },
        fillStyle: "",
        font: "",
        textBaseline: "",
        fillRect: vi.fn(),
        drawImage: vi.fn(),
        fillText: vi.fn(),
        measureText: vi.fn(() => ({ width: 10 })),
      } as unknown as CanvasRenderingContext2D;
      const getContext = vi
        .spyOn(HTMLCanvasElement.prototype, "getContext")
        .mockReturnValue(context);

      const result = await exportView({ store, options: emptyOptions });

      expect(result.blob).toBe(blob);
      expect(deckInstances).toHaveLength(1);
      expect(deckInstances[0].finalize).toHaveBeenCalled();
      expect(result.filename).toMatch(/^slide_\d{4}-\d{2}-\d{2}-\d{6}\.png$/);

      getContext.mockRestore();
      toBlob.mockRestore();
    },
  );

  test("exportView fails with an actionable error when no view is active", async () => {
    store.setState({ viewStateActive: null });

    await expect(exportView({ store, options: emptyOptions })).rejects.toThrow(
      "No image view is active to capture.",
    );
  });
});
