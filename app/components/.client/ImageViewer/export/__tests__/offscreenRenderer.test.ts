vi.mock("~/utils/db/getTileDataWasm", () => ({
  readAllAnnotations: vi.fn().mockResolvedValue([]),
}));

import { describe, expect, test, vi } from "vitest";

import type { Bounds } from "../../components/canvas/Measurements/calculateViewStateToFitBounds";
import type { ViewState } from "../../state/store/types";
import { frameCurrentView, frameRegion, REGION_MARGIN } from "../offscreenRenderer";

const viewState = {
  target: [5000, 4000],
  zoom: 1,
  width: 800,
  height: 600,
  rotationX: 0,
  rotationOrbit: 0,
  minRotationX: 0,
  maxRotationX: Math.PI / 2,
} as unknown as ViewState;

describe("frameCurrentView", () => {
  test("lifts zoom by log2(scale) on the same target", () => {
    const framed = frameCurrentView(viewState, 2);
    expect(framed.viewState.zoom).toBeCloseTo(2);
    expect(framed.viewState.target).toEqual([5000, 4000]);
  });

  test("reports the viewport's level-0 extent", () => {
    const framed = frameCurrentView(viewState, 2);
    // width 800 at zoom 1 covers 400 level-0 px.
    expect(framed.level0Width).toBeCloseTo(400);
    expect(framed.level0Height).toBeCloseTo(300);
  });
});

describe("frameRegion", () => {
  const bounds: Bounds = [1000, 2000, 1100, 2050];

  test("centers on the region and expands to the viewport aspect", () => {
    const framed = frameRegion(viewState, bounds, 2);
    expect(framed.viewState.target).toEqual([1050, 2025]);
    // Region extent: 100×50, +2% margin each side → 104×52. Viewport aspect
    // 800/600 = 4:3, so the width axis governs: 104 wide, 78 tall.
    expect(framed.level0Width).toBeCloseTo(104, 0);
    expect(framed.level0Height).toBeCloseTo(104 / (4 / 3), 0);
  });

  test("zoom fills the buffer with the framed extent", () => {
    const scale = 2;
    const framed = frameRegion(viewState, bounds, scale);
    const bufferWidth = viewState.width * scale;
    expect(2 ** framed.viewState.zoom * framed.level0Width).toBeCloseTo(bufferWidth, 0);
  });

  test("uses the shared margin constant", () => {
    expect(REGION_MARGIN).toBe(0.02);
  });
});
