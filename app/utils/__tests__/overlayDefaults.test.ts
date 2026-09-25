import { DEFAULT_OVERLAYS_FILL_OPACITY } from "../overlayDefaults";
import { select } from "~/components/.client/ImageViewer/state/store/selectors";
import { createDefaultLayersStateEntry } from "~/components/.client/ImageViewer/state/store/types";
import type { ViewerStore } from "~/components/.client/ImageViewer/state/store/types";

describe("DEFAULT_OVERLAYS_FILL_OPACITY", () => {
  test("is semi-transparent", () => {
    expect(DEFAULT_OVERLAYS_FILL_OPACITY).toBeGreaterThan(0);
    expect(DEFAULT_OVERLAYS_FILL_OPACITY).toBeLessThan(1);
  });

  test("seeds a new layers state entry", () => {
    expect(createDefaultLayersStateEntry().overlaysFillOpacity).toBe(DEFAULT_OVERLAYS_FILL_OPACITY);
  });

  test("is the selector fallback when no layers state exists", () => {
    const emptyStore = { imagePanels: [0], imagePanelIndex: 0, layersStates: [] };
    expect(select.overlaysFillOpacity(emptyStore as unknown as ViewerStore)).toBe(
      DEFAULT_OVERLAYS_FILL_OPACITY,
    );
  });
});
