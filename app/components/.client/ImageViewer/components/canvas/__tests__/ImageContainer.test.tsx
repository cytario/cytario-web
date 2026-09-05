import { render, screen } from "@testing-library/react";
import { useStore } from "zustand";

import { createViewerStore } from "../../../state/store/createViewerStore";
import type { ViewerStore } from "../../../state/store/types";
import { ImageContainer } from "../ImageContainer";

let currentStore: ReturnType<typeof createViewerStore>;

vi.mock("../../../state/store/ViewerStoreContext", () => ({
  useViewerStore: <T,>(selector: (state: ViewerStore) => T): T => useStore(currentStore, selector),
}));

describe("ImageContainer", () => {
  test("shows the load error's message when the viewer errors", () => {
    currentStore = createViewerStore(`test-conn/images/bad-${Date.now()}.ome.tif`, "");
    currentStore.getState().setError(new Error("OME-TIFF is not tile-based: 14004 strips"));

    render(<ImageContainer isPreview>{() => <div data-testid="viewport" />}</ImageContainer>);

    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
    expect(screen.getByText(/not tile-based: 14004 strips/)).toBeInTheDocument();
    expect(screen.queryByTestId("viewport")).toBeNull();
  });
});
