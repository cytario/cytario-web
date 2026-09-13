import { getOverlayState, markerDisplayLabel } from "../getOverlayState";
import type { OverlayConfig } from "~/utils/db/overlayConfig";

const config: OverlayConfig = {
  version: 1,
  columns: { id: "object", geometry: "geom", x: "x", y: "y" },
  classes: [
    { sourceColumn: "marker_positive_cd4", label: "CD4", mode: "boolean" },
    {
      sourceColumn: "intensity_cd8",
      label: "CD8 intensity",
      mode: "threshold",
      operator: ">",
      threshold: 3,
    },
  ],
};

describe("markerDisplayLabel", () => {
  test("uses the config label when present", () => {
    expect(markerDisplayLabel("marker_positive_cd4", config)).toBe("CD4");
    expect(markerDisplayLabel("intensity_cd8", config)).toBe("CD8 intensity");
  });

  test("strips the marker_positive_ prefix without a config", () => {
    expect(markerDisplayLabel("marker_positive_pd-1", null)).toBe("pd-1");
  });

  test("falls back to the raw key", () => {
    expect(markerDisplayLabel("custom_col", null)).toBe("custom_col");
  });
});

describe("getOverlayState with config", () => {
  test("derives marker labels from the config classes", () => {
    const state = getOverlayState(
      { marker_positive_cd4: { count: 3 }, intensity_cd8: { count: 5 } },
      config,
    );

    expect(state["marker_positive_cd4"].label).toBe("CD4");
    expect(state["intensity_cd8"].label).toBe("CD8 intensity");
    expect(state["marker_positive_cd4"].count).toBe(3);
    expect(state["marker_positive_cd4"].isVisible).toBe(false);
  });

  test("falls back to prefix-stripped keys without a config", () => {
    const state = getOverlayState({ marker_positive_cd4: { count: 1 } });
    expect(state["marker_positive_cd4"].label).toBe("cd4");
  });
});
