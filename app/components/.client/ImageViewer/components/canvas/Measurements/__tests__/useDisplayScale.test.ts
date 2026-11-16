import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useDisplayScale } from "../useDisplayScale";
import { useViewerDisplayStore } from "~/utils/viewerDisplayStore/useViewerDisplayStore";

let metadata: unknown = null;

vi.mock("../../../../state/store/core/ViewerStoreContext", () => ({
  useViewerStore: <T>(selector: (state: { metadata: unknown }) => T): T => selector({ metadata }),
}));

const withPixels = (pixels: Record<string, unknown>) => {
  metadata = { Pixels: pixels };
};

describe("useDisplayScale", () => {
  beforeEach(() => {
    useViewerDisplayStore.setState({ displayUnit: "metric" });
  });

  test("metric carries the image's physical pixel size", () => {
    withPixels({ PhysicalSizeX: 0.5, PhysicalSizeXUnit: "nanometer" });
    expect(renderHook(() => useDisplayScale()).result.current).toEqual({
      unit: "metric",
      pixelSize: { x: 5e-7, y: 5e-7 },
    });
  });

  test("the pixel preference wins when the image has a physical scale", () => {
    withPixels({ PhysicalSizeX: 0.5, PhysicalSizeXUnit: "µm" });
    useViewerDisplayStore.setState({ displayUnit: "pixels" });
    expect(renderHook(() => useDisplayScale()).result.current).toEqual({
      unit: "pixels",
      metricAvailable: true,
    });
  });

  test.each([
    ["no physical size", {}],
    ["an unreadable unit", { PhysicalSizeX: 0.5, PhysicalSizeXUnit: "pixel" }],
  ])("falls back to pixels with %s, even when metric is preferred", (_case, pixels) => {
    withPixels(pixels);
    expect(renderHook(() => useDisplayScale()).result.current).toEqual({
      unit: "pixels",
      metricAvailable: false,
    });
  });

  test("falls back to pixels before metadata loads", () => {
    metadata = null;
    expect(renderHook(() => useDisplayScale()).result.current.unit).toBe("pixels");
  });
});
