import { beforeEach, describe, expect, test, vi } from "vitest";

import { GESTURE_DEBOUNCE_MS } from "../../../state/store/core/viewerTemporal";
import { createViewerStore } from "../../../state/store/createViewerStore";
import { CAPTURES_CLASS, commitExportAnnotation } from "../commitExportAnnotation";
import {
  captureFilename,
  captureTimestamp,
  composeCapture,
  ExportRenderError,
  RESOLUTION_PRESETS,
} from "../composeCapture";
import * as decorations from "../decorations";

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
    expect(captureTimestamp()).toBe("2025-01-07-130509");
    expect(captureFilename("slide", "2024-12-31-235959")).toBe("slide_2024-12-31-235959");

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
  let getImageData: ReturnType<typeof vi.fn>;

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
      getImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    drawImage = context.drawImage as ReturnType<typeof vi.fn>;
    getImageData = context.getImageData as ReturnType<typeof vi.fn>;
    // Varied pixels by default: the frame copy normally renders an image.
    getImageData.mockReturnValue({ data: variedPixels() });
    getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  });

  const NO_DECORATIONS = {
    scaleBar: false,
    legend: false,
  };

  const metadata = {
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
  } as unknown as Parameters<typeof composeCapture>[1]["metadata"];

  const frame = {
    bounds: [0, 0, 3840, 2160] as [number, number, number, number],
    width: 1920,
    height: 1080,
    clamped: true,
    upscaled: false,
  };

  // Sparse pixel buffers for the uniformity sampler: one uniform, one with
  // scattered variation the sampler must find.
  const uniformPixels = () => new Uint8ClampedArray(1920 * 1080 * 4).fill(120);
  const variedPixels = () => {
    const data = uniformPixels();
    data.set([255, 0, 0, 255], 0);
    return data;
  };

  const renderCanvasOf = (width: number, height: number) => {
    const renderCanvas = document.createElement("canvas");
    renderCanvas.width = width;
    renderCanvas.height = height;
    return renderCanvas;
  };

  test("copies the render buffer 1:1 — the buffer already is the output", async () => {
    const renderCanvas = renderCanvasOf(1920, 1080);

    const result = await composeCapture(renderCanvas, {
      preset: RESOLUTION_PRESETS[1],
      imageBasename: "slide",
      decorations: NO_DECORATIONS,
      frame,
      metadata,
      legend: { channels: [], overlays: [] },
    });

    expect(drawImage).toHaveBeenCalledWith(renderCanvas, 0, 0);
    expect(result).toMatchObject({
      width: 1920,
      height: 1080,
      clamped: true,
      upscaled: false,
      uniform: false,
    });

    getContext.mockRestore();
    toBlob.mockRestore();
  });

  test("reports a uniformly flat image area — e.g. an opaque annotation covering the frame", async () => {
    getImageData.mockReturnValue({ data: uniformPixels() });

    const result = await composeCapture(renderCanvasOf(1920, 1080), {
      preset: RESOLUTION_PRESETS[1],
      imageBasename: "slide",
      decorations: NO_DECORATIONS,
      frame,
      metadata,
      legend: { channels: [], overlays: [] },
    });

    expect(result.uniform).toBe(true);

    getContext.mockRestore();
    toBlob.mockRestore();
  });

  test("draws no scale bar for an image without a physical pixel size", async () => {
    const renderCanvas = renderCanvasOf(1920, 1080);
    const drawScaleBar = vi.spyOn(decorations, "drawScaleBarDecoration");

    await composeCapture(renderCanvas, {
      preset: RESOLUTION_PRESETS[1],
      imageBasename: "slide",
      decorations: { ...NO_DECORATIONS, scaleBar: true },
      frame,
      metadata: { ...metadata, Pixels: { ...metadata.Pixels, PhysicalSizeX: undefined } },
      legend: { channels: [], overlays: [] },
    });

    expect(drawScaleBar).not.toHaveBeenCalled();

    drawScaleBar.mockRestore();
    getContext.mockRestore();
    toBlob.mockRestore();
  });

  test("rejects a render buffer that is not the frame's size", async () => {
    await expect(
      composeCapture(renderCanvasOf(960, 540), {
        preset: RESOLUTION_PRESETS[1],
        imageBasename: "slide",
        decorations: NO_DECORATIONS,
        frame,
        metadata,
        legend: { channels: [], overlays: [] },
      }),
    ).rejects.toThrow("rendered 960 × 540 px instead of 1920 × 1080 px");

    getContext.mockRestore();
    toBlob.mockRestore();
  });
});

describe("provenance export annotation", () => {
  beforeEach(seedStore);

  test("commits a rectangle of the exported extent, named by the capture time alone", () => {
    const before = store.getState().annotationSets[0].features.length;

    commitExportAnnotation(store, {
      bounds: [100, 200, 356, 344],
      name: "2025-01-07-130509",
    });

    const set = store.getState().annotationSets[0];
    expect(set.features).toHaveLength(before + 1);

    const created = set.features[set.features.length - 1];
    expect(created.properties?.name).toBe("2025-01-07-130509");
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

  test("files the region under the Captures class, registered with a color", () => {
    commitExportAnnotation(store, { bounds: [100, 200, 356, 344], name: "2025-01-07-130509" });

    const { annotationSets, annotationClasses, annotationView } = store.getState();
    const created = annotationSets[0].features[0];
    const registered = annotationClasses["own-set"]?.find(({ name }) => name === CAPTURES_CLASS);
    expect(created.properties?.classification).toEqual({
      name: CAPTURES_CLASS,
      color: registered?.color,
    });
    expect(annotationView["own-set"]?.hiddenClasses ?? []).not.toContain(CAPTURES_CLASS);
  });

  test("later captures join the existing Captures class and keep its color", () => {
    commitExportAnnotation(store, { bounds: [0, 0, 10, 10], name: "2025-01-07-130509" });
    const firstColor =
      store.getState().annotationSets[0].features[0].properties?.classification?.color;

    commitExportAnnotation(store, { bounds: [20, 20, 30, 30], name: "2025-01-07-130512" });

    const features = store.getState().annotationSets[0].features;
    expect(features.map((f) => f.properties?.classification)).toEqual([
      { name: CAPTURES_CLASS, color: firstColor },
      { name: CAPTURES_CLASS, color: firstColor },
    ]);
    expect(
      store.getState().annotationClasses["own-set"]?.filter(({ name }) => name === CAPTURES_CLASS),
    ).toHaveLength(1);
  });

  test("creates an own set when the image has none — the export never vanishes", () => {
    store.setState({ annotationSets: [], activeSetId: null });

    commitExportAnnotation(store, {
      bounds: [100, 200, 356, 344],
      name: "2025-01-07-130509",
    });

    const { annotationSets, activeSetId, annotationSelectedIds } = store.getState();
    expect(annotationSets).toHaveLength(1);
    expect(annotationSets[0]).toMatchObject({ id: activeSetId, createdBy: "user-a" });
    expect(annotationSets[0].features).toHaveLength(1);
    expect(annotationSelectedIds).toEqual([annotationSets[0].features[0].id]);
  });

  test("writes into the active set", () => {
    store.setState((state) => {
      state.annotationSets.push({
        id: "second",
        createdBy: "user-a",
        name: "Second",
        features: [],
      });
      state.activeSetId = "second";
    });

    commitExportAnnotation(store, {
      bounds: [100, 200, 356, 344],
      name: "2025-01-07-130509",
    });

    const sets = store.getState().annotationSets;
    expect(sets.find((set) => set.id === "second")?.features).toHaveLength(1);
    expect(sets.find((set) => set.id === "own-set")?.features).toHaveLength(0);
  });

  test("rejects a degenerate area instead of dropping it silently", () => {
    expect(() =>
      commitExportAnnotation(store, { bounds: [NaN, 0, 1, 1], name: "2025-01-07-130509" }),
    ).toThrow("not a valid annotation region");
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

    commitExportAnnotation(store, {
      bounds: [100, 200, 356, 344],
      name: "2025-01-07-130509",
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
