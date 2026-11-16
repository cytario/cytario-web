import { OrthographicViewport } from "@deck.gl/core";
import { describe, expect, test } from "vitest";

import type { ViewState } from "../../../state/store/types";
import type { Bounds } from "../../canvas/Measurements/calculateViewStateToFitBounds";
import {
  captureBounds,
  currentViewBounds,
  frameCapture,
  millimetersPerOutputPixel,
  viewStateForFrame,
  type CaptureFrame,
} from "../captureFrame";
import { RESOLUTION_PRESETS } from "../composeCapture";

const LIMITS = { maxCanvasSide: 16384, areaLimit: 16384 * 16384 };

const panelViewState = (overrides: Partial<ViewState> = {}): ViewState =>
  ({
    target: [5000, 4000],
    zoom: -2,
    width: 1000,
    height: 600,
    rotationX: 0,
    rotationOrbit: 0,
    minRotationX: 0,
    maxRotationX: 90,
    minZoom: -6,
    maxZoom: 2,
    transitionDuration: 0,
    ...overrides,
  }) as ViewState;

/** The level-0 rectangle a deck of the frame's CSS size actually shows. */
const renderedBounds = (frame: CaptureFrame, base: ViewState): Bounds => {
  const viewState = viewStateForFrame(frame, base);
  const viewport = new OrthographicViewport({
    width: viewState.width,
    height: viewState.height,
    target: [...viewState.target, 0],
    zoom: viewState.zoom,
  });
  const [minX, minY] = viewport.unproject([0, 0]);
  const [maxX, maxY] = viewport.unproject([viewState.width, viewState.height]);
  return [minX, minY, maxX, maxY];
};

const expectBoundsClose = (actual: Bounds, expected: Bounds) => {
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 3));
};

describe("currentViewBounds", () => {
  test("is the level-0 rectangle the viewport shows", () => {
    // 1000 × 600 CSS px at zoom −2 cover 4000 × 2400 level-0 px.
    expect(currentViewBounds(panelViewState())).toEqual([3000, 2800, 7000, 5200]);
  });
});

describe("captureBounds", () => {
  test("exports exactly the region — no margin — over the current view", () => {
    const region: Bounds = [0, 0, 100, 100];
    expect(captureBounds(panelViewState(), region)).toEqual(region);
    expect(captureBounds(panelViewState(), null)).toEqual(currentViewBounds(panelViewState()));
  });
});

describe("frameCapture", () => {
  test("the output keeps the bounds' aspect at the preset's width", () => {
    const frame = frameCapture([0, 0, 4000, 1000], 2000, LIMITS);
    expect(frame.width).toBe(2000);
    expect(frame.height).toBe(500);
    expect(frame.upscaled).toBe(false);
  });

  test("caps at 2× native for a small region and flags the upscale", () => {
    const frame = frameCapture([0, 0, 400, 800], 3500, LIMITS);
    expect(frame.width).toBe(800);
    expect(frame.height).toBe(1600);
    expect(frame.upscaled).toBe(true);
  });

  test("clamps to the browser limits and reports it", () => {
    const frame = frameCapture([0, 0, 40000, 40000], 3500, {
      maxCanvasSide: 2048,
      areaLimit: 2048 * 2048,
    });
    expect(frame.width).toBe(2048);
    expect(frame.clamped).toBe(true);
  });
});

describe("the capture deck renders exactly the exported rectangle", () => {
  const sources: { name: string; base: ViewState; region: Bounds | null }[] = [
    { name: "current view, wide panel", base: panelViewState(), region: null },
    {
      name: "current view, narrow panel zoomed in",
      base: panelViewState({ width: 420, height: 900, zoom: 1 }),
      region: null,
    },
    {
      name: "tall region in a wide panel",
      base: panelViewState(),
      region: [1000, 2000, 1300, 3200],
    },
    {
      name: "wide region in a tall panel",
      base: panelViewState({ width: 500, height: 1000 }),
      region: [6000, 100, 9000, 700],
    },
  ];

  for (const { name, base, region } of sources) {
    for (const preset of RESOLUTION_PRESETS) {
      test(`${name} — ${preset.name}`, () => {
        const bounds = captureBounds(base, region);
        const frame = frameCapture(bounds, preset.targetWidthPx, LIMITS);

        expectBoundsClose(renderedBounds(frame, base), frame.bounds);
        // Snapping to integer output pixels moves the rectangle by under one output px.
        const level0PerPixel = (bounds[2] - bounds[0]) / frame.width;
        frame.bounds.forEach((value, index) =>
          expect(Math.abs(value - bounds[index])).toBeLessThan(level0PerPixel),
        );
      });
    }
  }
});

describe("millimetersPerOutputPixel", () => {
  test("is the level-0 pixel size times level-0 pixels per output pixel", () => {
    const frame = frameCapture([0, 0, 4000, 2000], 2000, LIMITS);
    // 0.25 µm level-0 pixels, 2 level-0 px per output px.
    expect(millimetersPerOutputPixel(frame, 0.00025)).toBeCloseTo(0.0005, 10);
  });
});
