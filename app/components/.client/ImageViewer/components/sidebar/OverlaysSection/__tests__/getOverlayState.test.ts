import type { OverlaysState } from "../../../../state/store/types";
import { CATEGORICAL_COLORS } from "../../SectionRow/ColorPicker/utils";
import { getOverlayState, markerDisplayLabel, paletteOffsetFor } from "../getOverlayState";
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

describe("palette offset across overlays", () => {
  const makeMarker = () => ({
    color: [0, 0, 0, 1] as [number, number, number, number],
    count: 0,
    isVisible: false,
    label: "",
  });

  const makeOverlays = (markerCounts: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(markerCounts).map(([id, markerCount]) => [
        id,
        {
          markers: Object.fromEntries(
            Array.from({ length: markerCount }, (_, i) => [`marker_${i}`, makeMarker()]),
          ),
          config: null,
        },
      ]),
    ) as unknown as OverlaysState;

  test("counts only markers from other overlays", () => {
    const overlays = makeOverlays({ "res-a": 3, "res-b": 2, "res-c": 4 });

    expect(paletteOffsetFor(overlays, "res-b")).toBe(7);
    expect(paletteOffsetFor(overlays, "res-a")).toBe(6);
    expect(paletteOffsetFor({}, "res-a")).toBe(0);
  });

  test("offset shifts the palette so same-named markers land on distinct colors", () => {
    const first = getOverlayState({ marker_positive_ck: { count: 1 } });
    const second = getOverlayState({ marker_positive_ck: { count: 1 } }, null, 1);

    expect(first["marker_positive_ck"].color).toEqual(CATEGORICAL_COLORS[0]);
    expect(second["marker_positive_ck"].color).toEqual(CATEGORICAL_COLORS[1]);
  });

  test("offset wraps around the palette", () => {
    const state = getOverlayState({ a: { count: 1 } }, null, CATEGORICAL_COLORS.length + 1);

    expect(state["a"].color).toEqual(CATEGORICAL_COLORS[1]);
  });
});
