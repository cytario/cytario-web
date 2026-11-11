import { ToastProvider } from "@cytario/design";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useStore } from "zustand";

import { createViewerStore } from "../../../state/store/createViewerStore";
import type { ViewerStore } from "../../../state/store/types";
import { ExportDialog } from "../ExportDialog";
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

const exportViewMock = vi.fn();
const commitExportAnnotationMock = vi.fn();

vi.mock("~/utils/db/getTileDataWasm", () => ({
  readAllAnnotations: vi.fn().mockResolvedValue([]),
}));

vi.mock("../commitExportAnnotation", () => ({
  commitExportAnnotation: (...args: unknown[]) => commitExportAnnotationMock(...args),
}));

vi.mock("../../../export/exportView", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../export/exportView")>();
  return {
    ...actual,
    exportView: (...args: unknown[]) => exportViewMock(...args),
    rectangleRegionsOfOwnSets: actual.rectangleRegionsOfOwnSets,
    downloadExport: vi.fn(),
    copyExportToClipboard: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("../FramedViewPreview", () => ({
  FramedViewPreview: () => (
    <canvas data-testid="framed-view-preview" aria-label="Framed view preview" />
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

const renderDialog = (canAnnotate = true) => {
  seedViewerConnection("test-conn", canAnnotate ? "annotate" : "read-only");
  return render(
    <ToastProvider>
      <ExportDialog isOpen onClose={() => {}} />
    </ToastProvider>,
  );
};

const exportBlob = () =>
  ({
    blob: new Blob(["png"], { type: "image/png" }),
    filename: "slide_2025-01-07-130509.png",
    width: 1600,
    height: 1200,
    clamped: false,
    upscaled: false,
  }) as never;

describe("ExportDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exportViewMock.mockResolvedValue(exportBlob());
    buildStore();
  });

  test("renders with spec defaults: Current view, 2×, As viewed, decoration states", () => {
    renderDialog();

    expect(screen.getByRole("radio", { name: /current view/i })).toBeInTheDocument();
    expect(screen.getAllByText("2×").length).toBeGreaterThan(0);
    expect(screen.getAllByText("As viewed").length).toBeGreaterThan(0);
  });

  test("defaults decorations per spec and channel labels follow visible channels", () => {
    renderDialog();

    const checkbox = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
    // Two visible channels → channel labels default on.
    expect(checkbox("Scale bar").checked).toBe(true);
    expect(checkbox("Magnification").checked).toBe(true);
    expect(checkbox("Channel labels").checked).toBe(true);
    expect(checkbox("Annotation regions").checked).toBe(false);
    expect(checkbox("Caption").checked).toBe(false);
  });

  test("channel labels default off with a single visible channel", () => {
    currentStore.setState((state) => {
      state.channels.FITC.isVisible = false;
      state.layersStates[0].channels.FITC.isVisible = false;
    });

    renderDialog();

    const checkbox = screen.getByRole("checkbox", { name: "Channel labels" }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  test("shows the region picker only when the source is Annotation region", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.queryByRole("button", { name: /annotation region/i })).toBeNull();

    await user.click(screen.getByRole("radio", { name: /annotation region/i }));

    expect(screen.getByRole("button", { name: /annotation region/i })).toBeInTheDocument();
  });

  test("read-only connections keep the source at Current view", () => {
    renderDialog(false);

    const regionOption = screen.getByRole("radio", { name: /annotation region/i });
    expect(regionOption).toBeDisabled();
    expect(screen.queryByRole("button", { name: /annotation region/i })).toBeNull();
  });

  test("the create-export-annotation checkbox appears only for region exports", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.queryByRole("checkbox", { name: /create export annotation/i })).toBeNull();

    await user.click(screen.getByRole("radio", { name: /annotation region/i }));

    const checkbox = screen.getByRole("checkbox", {
      name: /create export annotation/i,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true); // defaults on
  });

  test("Download runs the engine with the chosen options", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => {
      expect(exportViewMock).toHaveBeenCalledTimes(1);
    });
    const call = exportViewMock.mock.calls[0][0];
    expect(call.options).toMatchObject({
      source: { kind: "current-view" },
      scale: 2,
      aspect: "as-viewed",
      decorations: {
        scaleBar: true,
        magnification: true,
        channelLabels: true,
        annotationRegions: false,
        caption: false,
      },
    });
    expect(call.options.imageBasename).toBe("slide");
  });

  test("Copy to clipboard runs the engine once", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: /copy to clipboard/i }));

    await waitFor(() => {
      expect(exportViewMock).toHaveBeenCalledTimes(1);
    });
  });

  test("shows progress state while the render is pending", async () => {
    let resolveRender: (value: never) => void;
    exportViewMock.mockImplementation(
      () => new Promise((resolve) => (resolveRender = resolve as never)),
    );

    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: /download/i }));

    expect(await screen.findByText(/Rendering 1600 × 1200 px…/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel render/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /download/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /copy to clipboard/i })).toBeDisabled();

    resolveRender!(exportBlob());
  });

  test("a region export with the annotation checkbox commits the provenance region", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("radio", { name: /annotation region/i }));

    // Pick a region in the Select (react-aria listbox opens on trigger click).
    await user.click(screen.getByRole("button", { name: /annotation region/i }));
    await user.click(await screen.findByRole("option", { name: "Region A" }));

    await user.click(screen.getByRole("button", { name: /download/i }));

    await waitFor(() => {
      expect(exportViewMock).toHaveBeenCalledTimes(1);
    });
    const call = exportViewMock.mock.calls[0][0];
    expect(call.options.source).toMatchObject({ kind: "annotation-region" });

    await waitFor(() => {
      expect(commitExportAnnotationMock).toHaveBeenCalled();
    });
    const [storeSource, setId] = commitExportAnnotationMock.mock.calls[0];
    expect(setId).toBe("own-set");
    expect(storeSource.getState().annotationSets).toBeDefined();
    expect(storeSource.getState().currentUserId).toBe("own-user");
  });
});
