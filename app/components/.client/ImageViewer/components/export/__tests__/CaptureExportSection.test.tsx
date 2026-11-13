import { ToastProvider } from "@cytario/design";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useStore } from "zustand";

import { createViewerStore } from "../../../state/store/createViewerStore";
import type { ViewerStore } from "../../../state/store/types";
import { CaptureExportSection } from "../CaptureExportSection";
import { commitExportAnnotation as commitExportAnnotationActual } from "../commitExportAnnotation";
import { seedViewerConnection } from "~/utils/__tests__/__mocks__";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";

let currentStore: ReturnType<typeof createViewerStore>;

vi.mock("../../../state/store/core/ViewerStoreContext", () => ({
  useViewerStore: <T,>(selector: (state: ViewerStore) => T): T => useStore(currentStore, selector),
  useViewerStoreApi: () => currentStore,
}));

vi.mock("~/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ sub: "own-user" }),
}));

vi.mock("~/utils/db/getTileDataWasm", () => ({
  readAllAnnotations: vi.fn().mockResolvedValue([]),
}));

const runExportMock = vi.fn();
const commitExportAnnotationMock = vi.fn();

vi.mock("../runExport", () => ({
  runExport: (...args: unknown[]) => runExportMock(...args),
  downloadExport: vi.fn(),
  copyExportToClipboard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../commitExportAnnotation", () => ({
  commitExportAnnotation: (...args: unknown[]) => commitExportAnnotationMock(...args),
}));

vi.mock("~/components/Section/Section", () => ({
  Section: ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <section aria-label={title} data-section-id={id}>
      {children}
    </section>
  ),
}));

const rectangleFeature = (id: string, name: string): AnnotationFeature => ({
  type: "Feature",
  id,
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [512, 0],
        [512, 512],
        [0, 512],
        [0, 0],
      ],
    ],
  },
  properties: { name },
});

const buildStore = () => {
  seedViewerConnection("test-conn", "annotate");
  currentStore = createViewerStore("test-conn/images/slide.ome.tif", "own-user");
  currentStore.setState({
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
      FITC: {
        selection: { c: 1, x: 0, y: 0, z: 0, t: 0 },
        domain: [0, 255],
        histogram: new Array(256).fill(0),
        isInitialized: true,
        isLoading: false,
        isVisible: true,
        contrastLimits: [0, 255],
        color: [255, 0, 0],
      },
    },
    channelIds: ["DAPI", "FITC"],
    imagePanels: [0],
    imagePanelIndex: 0,
    layersStates: [
      {
        id: "view-1",
        author: "own-user",
        channels: {
          DAPI: { isVisible: true, contrastLimits: [0, 255], color: [0, 255, 0] },
          FITC: { isVisible: true, contrastLimits: [0, 255], color: [255, 0, 0] },
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
    annotationSets: [
      {
        id: "own-set",
        createdBy: "own-user",
        name: "Own",
        features: [rectangleFeature("rect-1", "Region A"), rectangleFeature("rect-2", "Region B")],
      },
    ],
    activeSetId: "own-set",
  });
};

const renderSection = (canAnnotate = true) => {
  seedViewerConnection("test-conn", canAnnotate ? "annotate" : "read-only");
  return render(
    <ToastProvider>
      <CaptureExportSection />
    </ToastProvider>,
  );
};

const exportResult = () =>
  ({
    blob: new Blob(["png"], { type: "image/png" }),
    filename: "slide_2025-01-07-130509.png",
    width: 9449,
    height: 7087,
    clamped: false,
    upscaled: false,
  }) as never;

const within = () => screen.getByRole("region", { name: "Capture and export" });

describe("Capture and export section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runExportMock.mockResolvedValue(exportResult());
    buildStore();
  });

  test("renders with spec defaults: Current view, Presentation, decoration states", () => {
    renderSection();

    expect(screen.getByRole("radio", { name: /current view/i })).toBeInTheDocument();
    expect(screen.getAllByText("Presentation (300 DPI)").length).toBeGreaterThan(0);
  });

  test("defaults decorations per spec", () => {
    renderSection();

    const checkbox = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
    expect(checkbox("Scale bar").checked).toBe(true);
    expect(checkbox("Magnification").checked).toBe(true);
    expect(checkbox("Channel and overlay legend").checked).toBe(true);
    expect(checkbox("Annotation regions").checked).toBe(false);
    expect(checkbox("Cytario attribution").checked).toBe(true);
  });

  test("the resolution combobox exposes the three intent presets", () => {
    renderSection();

    const combobox = screen.getByRole("combobox", { name: "Resolution" });
    expect(combobox).toHaveValue("presentation");

    expect(screen.queryByText("2×")).toBeNull();
    expect(screen.queryByText("4×")).toBeNull();
  });

  test("shows the region picker only when the source is Annotation region", async () => {
    const user = userEvent.setup();
    renderSection();

    expect(screen.queryByRole("combobox", { name: "Region" })).toBeNull();

    await user.click(screen.getByRole("radio", { name: /annotation region/i }));

    expect(screen.getByRole("combobox", { name: "Region" })).toBeInTheDocument();
  });

  test("read-only connections keep the source at Current view", () => {
    renderSection(false);

    const regionOption = screen.getByRole("radio", { name: /annotation region/i });
    expect(regionOption).toBeDisabled();
    expect(screen.queryByRole("combobox", { name: "Region" })).toBeNull();
  });

  test("the create-export-annotation checkbox appears only for current-view exports and defaults off", async () => {
    const user = userEvent.setup();
    renderSection();

    const checkbox = screen.getByRole("checkbox", {
      name: /create export annotation/i,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    // Switching to a region source removes it — the region itself records the extent.
    await user.click(screen.getByRole("radio", { name: /annotation region/i }));
    expect(screen.queryByRole("checkbox", { name: /create export annotation/i })).toBeNull();
  });

  test("the summary line names the resolved output size", () => {
    renderSection();

    expect(screen.getByText(/Output: \d+ × \d+ px/)).toBeInTheDocument();
  });

  test("Download runs the capture with the chosen options", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => {
      expect(runExportMock).toHaveBeenCalledTimes(1);
    });
    const call = runExportMock.mock.calls[0][0];
    expect(call.preset).toMatchObject({ id: "presentation", dpi: 300 });
    expect(call.decorations).toMatchObject({
      scaleBar: true,
      magnification: true,
      legend: true,
      annotationRegions: false,
      attribution: true,
    });
    expect(call.imageBasename).toBe("slide");
    expect(call.regionFeatureId).toBeNull();
  });

  test("Copy runs the capture once", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: /^copy$/i }));

    await waitFor(() => {
      expect(runExportMock).toHaveBeenCalledTimes(1);
    });
  });

  test("shows progress state while the render is pending", async () => {
    let resolveRender: (value: never) => void;
    runExportMock.mockImplementation(
      () => new Promise((resolve) => (resolveRender = resolve as never)),
    );

    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: /download/i }));

    expect(await screen.findByText(/Rendering \d+ × \d+ px…/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^copy$/i })).toBeDisabled();

    resolveRender!(exportResult());
  });

  test("a current-view capture with the checkbox commits the exported extent", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("checkbox", { name: /create export annotation/i }));
    await user.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => {
      expect(commitExportAnnotationMock).toHaveBeenCalled();
    });
    const [storeSource, setId, provenance] = commitExportAnnotationMock.mock.calls[0];
    expect(setId).toBeNull();
    expect(storeSource.getState().currentUserId).toBe("own-user");
    // The provenance rectangle is the exported extent: the current view's
    // level-0 extent (800 × 600 px at zoom 0) around the target [512, 512].
    const [minX, minY, maxX, maxY] = provenance.bounds;
    expect(minX).toBeCloseTo(112, 0);
    expect(minY).toBeCloseTo(212, 0);
    expect(maxX).toBeCloseTo(912, 0);
    expect(maxY).toBeCloseTo(812, 0);
  });

  test("a region capture never commits a provenance annotation", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("radio", { name: /annotation region/i }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Region" }), "rect-1");
    await user.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => {
      expect(runExportMock).toHaveBeenCalledTimes(1);
    });
    expect(commitExportAnnotationMock).not.toHaveBeenCalled();
    expect(runExportMock.mock.calls[0][0].regionFeatureId).toBe("rect-1");
  });

  test("selecting a region frames the active panel on the region's extent", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("radio", { name: /annotation region/i }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Region" }), "rect-1");

    await waitFor(() => {
      const viewState = currentStore.getState().viewStateActive;
      expect(viewState?.target).toEqual([256, 256]);
    });
  });
});

void commitExportAnnotationActual;
void within;
