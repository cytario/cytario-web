import { describe, expect, test } from "vitest";

import type { ViewState } from "../../../state/store/types";
import type { Bounds } from "../../canvas/Measurements/calculateViewStateToFitBounds";
import { frameCurrentView, frameRegion, REGION_MARGIN } from "../frameExport";

const viewState = {
  target: [5000, 4000],
  zoom: 1,
  width: 800,
  height: 600,
  rotationX: 0,
  rotationOrbit: 0,
  minRotationX: 0,
  maxRotationX: Math.PI / 2,
  minZoom: -1,
  maxZoom: 2,
  transitionDuration: 0,
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

  test("centers on the region", () => {
    const framed = frameRegion(viewState, bounds, 1);
    expect(framed.viewState.target).toEqual([1050, 2025]);
  });

  test("the margin-expanded region extent is the framed level-0 extent", () => {
    const framed = frameRegion(viewState, bounds, 1);
    // Region 100×50 with 2% margin fills 1/1.04 of the viewport's wide axis:
    // the covered extent is 104 wide, expanded to the viewport's 4:3 aspect.
    expect(framed.level0Width).toBeCloseTo(104, 0);
    expect(framed.level0Height).toBeCloseTo(104 / (4 / 3), 0);
  });

  test("the framing fills the (scaled) viewport with the margin-expanded extent", () => {
    const scale = 2;
    const framed = frameRegion(viewState, bounds, scale);
    // At the framed zoom, the viewport covers exactly the margin-expanded extent.
    const coveredWidth = (viewState.width * scale) / 2 ** framed.viewState.zoom;
    const coveredHeight = (viewState.height * scale) / 2 ** framed.viewState.zoom;
    expect(coveredWidth).toBeCloseTo(framed.level0Width, 0);
    expect(coveredHeight).toBeCloseTo(framed.level0Height, 0);
  });

  test("scale widens the zoom, not the extent", () => {
    const one = frameRegion(viewState, bounds, 1);
    const two = frameRegion(viewState, bounds, 2);
    expect(two.viewState.zoom - one.viewState.zoom).toBeCloseTo(1, 5);
    expect(two.level0Width).toBeCloseTo(one.level0Width, 5);
    expect(two.level0Height).toBeCloseTo(one.level0Height, 5);
  });

  test("uses the shared margin constant", () => {
    expect(REGION_MARGIN).toBe(0.02);
  });
});
