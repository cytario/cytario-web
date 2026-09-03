import { render, screen } from "@testing-library/react";
import { useStore } from "zustand";

import { createViewerStore } from "../../state/store/createViewerStore";
import type { ViewerStore } from "../../state/store/types";
import { ViewerStoreContext } from "../../state/store/ViewerStoreContext";
import { Toolbar } from "../Toolbar";
import { seedViewerConnection } from "~/utils/__tests__/__mocks__";

let currentStore: ReturnType<typeof createViewerStore>;

vi.mock("../../state/store/ViewerStoreContext", async () => {
  const { createContext } = await import("react");
  return {
    useViewerStore: <T,>(selector: (state: ViewerStore) => T): T =>
      useStore(currentStore, selector),
    // Real context object so useUndoRedo (which reads it directly) works.
    ViewerStoreContext: createContext<unknown>(null),
  };
});

// ScaleBar renders from image metadata the test store never loads.
vi.mock("canvas/Measurements/ScaleBar", () => ({ ScaleBar: () => null }));

function renderToolbar(accessLevel: "annotate" | "read-only" = "annotate") {
  seedViewerConnection("test-conn", accessLevel);
  currentStore = createViewerStore(`test-conn/images/slide-${Math.random()}.ome.tif`, "");
  return render(
    <ViewerStoreContext.Provider value={currentStore as never}>
      <Toolbar />
    </ViewerStoreContext.Provider>,
  );
}

const drawLabels = [/Draw freehand/i, /Draw polygon/i, /Draw point/i];

describe("Toolbar — annotation draw tools by access level", () => {
  test("annotate grant shows the draw tools and undo/redo alongside view and inspect", () => {
    renderToolbar("annotate");

    expect(screen.getByRole("button", { name: /Drag, pan, and zoom/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Inspect pixel values/i })).toBeInTheDocument();
    for (const label of drawLabels) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Redo" })).toBeInTheDocument();
  });

  test("read-only grant hides the draw tools and undo/redo, keeps navigation", () => {
    renderToolbar("read-only");

    for (const label of drawLabels) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
    // No authoring → no history → the controls could never enable; don't render them.
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Redo" })).toBeNull();
    expect(screen.getByRole("button", { name: /Drag, pan, and zoom/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Inspect pixel values/i })).toBeInTheDocument();
  });
});
