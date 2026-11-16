import { describe, expect, test } from "vitest";

import {
  formatMetricLength,
  pickMetricScaleBar,
  pickPixelScaleBar,
  SCALE_BAR_LAYOUT,
} from "../scaleBarGeometry";

describe("pickMetricScaleBar", () => {
  test("picks the longest metric step that fits the maximum width", () => {
    // 1 mm = 1000 px: 100 µm = 100 px fits 140 px, 200 µm = 200 px does not.
    expect(pickMetricScaleBar(1000)).toEqual({ width: 100, label: "100 µm" });
  });

  test("caps the width when even the finest step overflows", () => {
    const { width, label } = pickMetricScaleBar(1e9);
    expect(label).toBe("1 nm");
    expect(width).toBe(SCALE_BAR_LAYOUT.maxWidth);
  });

  test("scales with the maximum width it is given", () => {
    // Twice the room at twice the pixel density picks the same step.
    expect(pickMetricScaleBar(2000, 280)).toEqual({ width: 200, label: "100 µm" });
  });
});

describe("pickPixelScaleBar", () => {
  test("picks a round number of image pixels that fits", () => {
    expect(pickPixelScaleBar(1)).toEqual({ width: 100, label: "100 px" });
    expect(pickPixelScaleBar(0.25)).toEqual({ width: 125, label: "500 px" });
  });

  test("caps the width when one image pixel overflows", () => {
    expect(pickPixelScaleBar(400)).toEqual({ width: 140, label: "1 px" });
  });
});

describe("formatMetricLength", () => {
  // Every scale bar step, labeled as the step table used to spell it out.
  test.each([
    [100, "10 cm"],
    [50, "5 cm"],
    [20, "2 cm"],
    [10, "1 cm"],
    [5, "5 mm"],
    [2, "2 mm"],
    [1, "1 mm"],
    [0.5, "500 µm"],
    [0.2, "200 µm"],
    [0.1, "100 µm"],
    [0.05, "50 µm"],
    [0.02, "20 µm"],
    [0.01, "10 µm"],
    [0.005, "5 µm"],
    [0.002, "2 µm"],
    [0.001, "1 µm"],
    [0.0005, "500 nm"],
    [0.0002, "200 nm"],
    [0.0001, "100 nm"],
    [0.00005, "50 nm"],
    [0.00002, "20 nm"],
    [0.00001, "10 nm"],
    [0.000005, "5 nm"],
    [0.000002, "2 nm"],
    [0.000001, "1 nm"],
  ])("%s mm reads %s", (millimeters, label) => {
    expect(formatMetricLength(millimeters).label).toBe(label);
  });

  test("picks the largest unit that keeps the value at least 1", () => {
    expect(formatMetricLength(0.128)).toMatchObject({ value: 128, unit: { symbol: "\u00b5m" } });
    expect(formatMetricLength(2.5)).toMatchObject({ value: 2.5, unit: { symbol: "mm" } });
    expect(formatMetricLength(0.0009)).toMatchObject({ value: 900, unit: { symbol: "nm" } });
  });

  test("falls back to the finest unit below 1 nm", () => {
    expect(formatMetricLength(5e-7).label).toBe("0.5 nm");
  });
});
