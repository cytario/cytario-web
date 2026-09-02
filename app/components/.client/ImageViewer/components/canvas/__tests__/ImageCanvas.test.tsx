import { ToastProvider } from "@cytario/design";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useStore } from "zustand";

import { createViewerStore } from "../../../state/store/createViewerStore";
import type { ViewerStore } from "../../../state/store/types";
import { ImageCanvas } from "../ImageCanvas";
import { seedViewerConnection } from "~/utils/__tests__/__mocks__";

let currentStore: ReturnType<typeof createViewerStore>;

vi.mock("../../../state/store/ViewerStoreContext", () => ({
  useViewerStore: <T,>(selector: (state: ViewerStore) => T): T => useStore(currentStore, selector),
}));

// deck.gl panels and the toolbar are irrelevant to the drop zone.
vi.mock("../ImagePanel", () => ({ ImagePanel: () => <div data-testid="image-panel" /> }));
vi.mock("../../Toolbar", () => ({ Toolbar: () => <div data-testid="toolbar" /> }));

const quPathExport = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "f1",
      geometry: { type: "Point", coordinates: [10, 20] },
      properties: {},
    },
  ],
};

function renderCanvas(accessLevel: "annotate" | "read-only" = "annotate") {
  seedViewerConnection("test-conn", accessLevel);
  currentStore = createViewerStore(`test-conn/images/slide-${Math.random()}.ome.tif`, "");
  const { container } = render(
    <ToastProvider>
      <ImageCanvas />
    </ToastProvider>,
  );
  // The DnD host is the outermost canvas div (no panels are loaded in tests).
  const canvas = container.firstElementChild as HTMLElement;
  return { canvas };
}

function drop(canvas: HTMLElement, fileOrFiles: File | File[]) {
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  fireEvent.drop(canvas, { dataTransfer: { types: ["Files"], files } });
}

describe("ImageCanvas — annotation drag-and-drop import", () => {
  test("shows the drop overlay while files are dragged over and hides on leave", () => {
    const { canvas } = renderCanvas();

    fireEvent.dragEnter(canvas, { dataTransfer: { types: ["Files"], files: [] } });
    expect(screen.getByText(/Drop annotation files to import/i)).toBeInTheDocument();

    fireEvent.dragLeave(canvas, { dataTransfer: { types: ["Files"], files: [] } });
    expect(screen.queryByText(/Drop annotation files to import/i)).toBeNull();
  });

  test("dropping a valid GeoJSON seeds an unowned annotation set", async () => {
    const { canvas } = renderCanvas();

    drop(
      canvas,
      new File([JSON.stringify(quPathExport)], "export.geojson", { type: "application/geo+json" }),
    );

    await waitFor(() => {
      expect(currentStore.getState().annotationSets).toHaveLength(1);
    });
    const set = currentStore.getState().annotationSets[0];
    expect(set.features).toHaveLength(1);
    expect(set.createdBy).toBeUndefined(); // unowned until someone edits
  });

  test("dropping a malformed file shows an error toast and adds no set", async () => {
    const { canvas } = renderCanvas();

    drop(canvas, new File(["{not json}"], "broken.json", { type: "application/json" }));

    await waitFor(() => {
      expect(screen.getByText(/"broken.json" is not valid JSON/)).toBeInTheDocument();
    });
    expect(currentStore.getState().annotationSets).toHaveLength(0);
  });

  test("ignores drops that contain no annotation import files", async () => {
    const { canvas } = renderCanvas();

    drop(canvas, new File(["hello"], "notes.txt", { type: "text/plain" }));

    // Nothing seeded, no error surfaced — the drop simply isn't for us.
    await vi.waitFor(() => {
      expect(currentStore.getState().annotationSets).toHaveLength(0);
    });
    expect(screen.queryByText(/is not valid JSON/)).toBeNull();
  });
});

describe("ImageCanvas — read-only connection", () => {
  test("shows no drop overlay while files are dragged over", () => {
    const { canvas } = renderCanvas("read-only");

    fireEvent.dragEnter(canvas, { dataTransfer: { types: ["Files"], files: [] } });
    expect(screen.queryByText(/Drop annotation files to import/i)).toBeNull();
  });

  test("dropping an annotation file surfaces a read-only error and seeds nothing", async () => {
    const { canvas } = renderCanvas("read-only");

    drop(
      canvas,
      new File([JSON.stringify(quPathExport)], "export.geojson", { type: "application/geo+json" }),
    );

    await waitFor(() => {
      expect(
        screen.getByText(/This connection is read-only — annotations cannot be imported/),
      ).toBeInTheDocument();
    });
    expect(currentStore.getState().annotationSets).toHaveLength(0);
  });
});
