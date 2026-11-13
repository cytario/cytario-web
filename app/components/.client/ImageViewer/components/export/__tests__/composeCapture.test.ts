import { beforeEach, describe, expect, test, vi } from "vitest";

import { GESTURE_DEBOUNCE_MS } from "../../../state/store/core/viewerTemporal";
import { createViewerStore } from "../../../state/store/createViewerStore";
import { commitExportAnnotation } from "../commitExportAnnotation";
import { captureFilename, composeCapture, ExportRenderError } from "../composeCapture";

vi.mock("~/utils/db/getTileDataWasm", () => ({
  readAllAnnotations: vi.fn().mockResolvedValue([]),
}));

let store: ReturnType<typeof createViewerStore>;

const seedStore = () => {
  store = createViewerStore("conn-1/images/slide.ome.tif", "user-a");
  store.setState({
    currentUserId: "user-a",
    annotationSets: [{ id: "own-set", createdBy: "user-a", name: "Own", features: [] }],
    activeSetId: "own-set",
  });
};

describe("captureFilename", () => {
  test("formats <image-basename>_YYYY-MM-DD-HHmmss", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 7, 13, 5, 9));

    expect(captureFilename("slide")).toBe("slide_2025-01-07-130509");

    vi.useRealTimers();
  });
});

describe("ExportRenderError", () => {
  test("carries an actionable message", () => {
    const error = new ExportRenderError("boom");
    expect(error.name).toBe("ExportRenderError");
    expect(error.message).toBe("boom");
  });
});

describe("composeCapture", () => {
  let drawImage: ReturnType<typeof vi.fn>;
  let getContext: ReturnType<typeof vi.spyOn>;
  let toBlob: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    seedStore();
    const blob = new Blob(["png"], { type: "image/png" });
    toBlob = vi
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
    drawImage = context.drawImage as ReturnType<typeof vi.fn>;
    getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  });

  test("maps the full render buffer into the whole output — source is the buffer, destination the output size", async () => {
    // The render buffer is device pixels (e.g. 2×); the output may clamp to
    // less. The whole buffer must land scaled into [0,0,outputWidth,outputHeight].
    const renderCanvas = document.createElement("canvas");
    renderCanvas.width = 1920;
    renderCanvas.height = 1080;

    const result = await composeCapture(renderCanvas, {
      dpi: 300,
      imageBasename: "slide",
      decorations: {
        scaleBar: false,
        magnification: false,
        legend: false,
        annotationRegions: false,
        attribution: false,
      },
      level0Width: 1920,
      level0Height: 1080,
      millimetersPerLevel0Pixel: 0.00025,
      metadata: null,
      legendItems: [],
      limits: { maxCanvasSide: 16384, areaLimit: 16384 * 16384 },
    });

    // 1920 level-0 px at 0.25 µm = 0.48 mm → 300 DPI ⇒ ~5.67 px… use a physical
    // size that yields a clean target: level0 10240 px would be 2.56 mm. Here
    // simply assert the mapping: source rect = full buffer, dest = full output.
    expect(result.blob).toBeDefined();
    expect(drawImage).toHaveBeenCalledWith(
      renderCanvas,
      0,
      0,
      1920,
      1080,
      0,
      0,
      result.width,
      result.height,
    );
    expect(result.width).toBeLessThanOrEqual(16384);

    getContext.mockRestore();
    toBlob.mockRestore();
  });

  test("the destination is the DPI-derived output size, not the buffer size", async () => {
    const renderCanvas = document.createElement("canvas");
    renderCanvas.width = 1280;
    renderCanvas.height = 720;

    // level0 extent 254 × 127 level-0 px at 10 µm/px = 2.54 × 1.27 mm.
    const result = await composeCapture(renderCanvas, {
      dpi: 1000, // 2.54 mm at 1000 DPI = 100 px wide, 1.27 mm → 50 px.
      imageBasename: "slide",
      decorations: {
        scaleBar: false,
        magnification: false,
        legend: false,
        annotationRegions: false,
        attribution: false,
      },
      level0Width: 254,
      level0Height: 127,
      millimetersPerLevel0Pixel: 0.01, // 10 µm/px → 254 × 127 level-0 px = 2.54 × 1.27 mm
      metadata: null,
      legendItems: [],
      limits: { maxCanvasSide: 16384, areaLimit: 16384 * 16384 },
    });

    // 2.54 mm at 1000 DPI = 100 px wide.
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
    expect(drawImage).toHaveBeenCalledWith(
      renderCanvas,
      0,
      0,
      renderCanvas.width,
      renderCanvas.height,
      0,
      0,
      100,
      50,
    );

    getContext.mockRestore();
    toBlob.mockRestore();
  });

  test("rejects an empty render buffer", async () => {
    const renderCanvas = document.createElement("canvas");
    renderCanvas.width = 0;
    renderCanvas.height = 0;

    await expect(
      composeCapture(renderCanvas, {
        dpi: 300,
        imageBasename: "slide",
        decorations: {
          scaleBar: false,
          magnification: false,
          legend: false,
          annotationRegions: false,
          attribution: false,
        },
        level0Width: 100,
        level0Height: 100,
        millimetersPerLevel0Pixel: 0.001,
        metadata: null,
        legendItems: [],
      }),
    ).rejects.toThrow("render buffer is empty");
  });
});

describe("provenance export annotation", () => {
  beforeEach(seedStore);

  test("commits a rectangle of the exported extent, named from the captured filename", () => {
    const before = store.getState().annotationSets[0].features.length;

    commitExportAnnotation(store, "own-set", {
      bounds: [100, 200, 356, 344],
      filename: "slide_2025-01-07-130509.png",
    });

    const set = store.getState().annotationSets[0];
    expect(set.features).toHaveLength(before + 1);

    const created = set.features[set.features.length - 1];
    expect(created.properties?.name).toBe("slide_2025-01-07-130509");
    expect(created.geometry.type).toBe("Polygon");
    // Exactly the exported level-0 extent.
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

    commitExportAnnotation(store, "own-set", {
      bounds: [100, 200, 356, 344],
      filename: "slide_2025-01-07-130509.png",
    });

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
    expect(store.getState().annotationSets[0].features).toHaveLength(0);
  });
});
