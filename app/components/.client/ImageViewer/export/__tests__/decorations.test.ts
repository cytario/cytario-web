import { describe, expect, test } from "vitest";

import {
  computeAspectFraming,
  magnificationText,
  millimetersPerUnit,
  scaleBarForPixelSize,
  scaleBarLabelForZoom,
} from "../decorations";

describe("scaleBarForPixelSize", () => {
  test("picks the coarsest ladder step that fits the max bar width", () => {
    // 0.00025 mm/px (250 nm/px): 100 µm → 400 px (too wide); 50 µm → 200 px
    // (too wide); 20 µm → 80 px (fits).
    const bar = scaleBarForPixelSize(0.00025);
    expect(bar.label).toBe("20 µm");
    expect(bar.widthPx).toBeCloseTo(0.02 / 0.00025, 5);
  });

  test("at 1 mm/px the bar is 10 cm", () => {
    const bar = scaleBarForPixelSize(1);
    expect(bar.label).toBe("10 cm");
    expect(bar.widthPx).toBeCloseTo(100, 5);
  });

  test("at finer pixel sizes the bar descends the ladder", () => {
    expect(scaleBarForPixelSize(0.001).label).toBe("100 µm");
    expect(scaleBarForPixelSize(0.00001).label).toBe("1 µm");
    expect(scaleBarForPixelSize(0.000001).label).toBe("100 nm");
  });

  test("at extreme zoom the bar stays within the cap by picking a finer step", () => {
    const bar = scaleBarForPixelSize(0.000002);
    // 2 nm/px: 200 nm → 100 px (fits).
    expect(bar.label).toBe("200 nm");
    expect(bar.widthPx).toBeCloseTo(100, 5);
  });
});

describe("millimetersPerUnit", () => {
  test("maps OME/NGFF units to millimeters", () => {
    expect(millimetersPerUnit("µm")).toBe(1e-3);
    expect(millimetersPerUnit("um")).toBe(1e-3);
    expect(millimetersPerUnit("nm")).toBe(1e-6);
    expect(millimetersPerUnit("mm")).toBe(1);
    expect(millimetersPerUnit("cm")).toBe(10);
  });

  test("unknown units fall back to µm", () => {
    expect(millimetersPerUnit("parsecs")).toBe(1e-3);
  });
});

describe("magnificationText", () => {
  test("renders the objective magnification when metadata declares it", () => {
    const result = magnificationText({
      NominalMagnification: 40,
      Pixels: { PhysicalSizeX: 0.25, PhysicalSizeXUnit: "µm" },
    });
    expect(result).toEqual({ text: "40×" });
  });

  test("falls back to the physical pixel size when no magnification", () => {
    const result = magnificationText({
      Pixels: { PhysicalSizeX: 0.25, PhysicalSizeXUnit: "µm" },
    });
    expect(result).toEqual({ text: "0.25 µm/px" });
  });

  test("renders sub-0.1 µm pixel sizes with enough decimals", () => {
    const result = magnificationText({
      Pixels: { PhysicalSizeX: 0.05, PhysicalSizeXUnit: "µm" },
    });
    expect(result).toEqual({ text: "0.05 µm/px" });
  });

  test("converts non-µm units to µm", () => {
    const result = magnificationText({
      Pixels: { PhysicalSizeX: 250, PhysicalSizeXUnit: "nm" },
    });
    expect(result).toEqual({ text: "0.25 µm/px" });
  });

  test("omits the decoration when neither is declared", () => {
    const result = magnificationText({
      Pixels: { PhysicalSizeXUnit: "µm" },
    });
    expect(result).toBeNull();
  });

  test("omits the decoration without metadata", () => {
    expect(magnificationText(null)).toBeNull();
  });
});

describe("computeAspectFraming", () => {
  test("as-viewed frames the full source with no crop", () => {
    const framing = computeAspectFraming(1920, 1080, "as-viewed");
    expect(framing.source).toEqual([0, 0, 1920, 1080]);
    expect(framing.destination).toEqual([0, 0, 1920, 1080]);
  });

  test("crops width around the center when the source is wider than 16:9", () => {
    const framing = computeAspectFraming(1600, 800, "16:9");
    // 800 * 16/9 ≈ 1422.2 → crop width 1422, centered.
    expect(framing.source[0]).toBe(Math.round((1600 - Math.round(800 * (16 / 9))) / 2));
    expect(framing.source[1]).toBe(0);
    expect(framing.source[3]).toBe(800);
    expect(framing.letterbox).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });

  test("crops height around the center when the source is taller than 4:3", () => {
    const framing = computeAspectFraming(1000, 1000, "4:3");
    const cropHeight = Math.round(1000 / (4 / 3));
    expect(framing.source[1]).toBe(Math.round((1000 - cropHeight) / 2));
    expect(framing.source[2]).toBe(1000);
    expect(framing.source[3]).toBe(cropHeight);
  });

  test("a matching aspect is a no-op", () => {
    const framing = computeAspectFraming(1600, 900, "16:9");
    expect(framing.source).toEqual([0, 0, 1600, 900]);
  });

  test("degenerate dimensions return the full frame", () => {
    const framing = computeAspectFraming(0, 100, "16:9");
    expect(framing.source).toEqual([0, 0, 0, 100]);
  });
});

describe("scaleBarLabelForZoom", () => {
  test("resolves the ladder label at the on-screen zoom and export scale", () => {
    // 0.25 µm/px at zoom 0: 1 export px = 0.25 µm at 1× → 100 µm bar is
    // 400 px wide (too wide), 50 µm → 200 (too wide), 20 µm → 80 px fits.
    expect(scaleBarLabelForZoom({ physicalSizeX: 0.25, unit: "µm", zoom: 0, scale: 1 })).toBe(
      "20 µm",
    );
  });

  test("at 2× each export pixel covers half the physical length", () => {
    // 0.25 µm/px, zoom 0, 2×: 1 export px = 0.125 µm → 20 µm bar is 160 px
    // (too wide), 10 µm → 80 px (fits).
    expect(scaleBarLabelForZoom({ physicalSizeX: 0.25, unit: "µm", zoom: 0, scale: 2 })).toBe(
      "10 µm",
    );
  });

  test("at higher zoom the bar refines", () => {
    // zoom 2 (¼ level-0 px per screen px), 1×: 1 export px = 62.5 nm →
    // 5 µm bar is 80 px (fits).
    expect(scaleBarLabelForZoom({ physicalSizeX: 0.25, unit: "µm", zoom: 2, scale: 1 })).toBe(
      "5 µm",
    );
  });

  test("returns null without a physical pixel size", () => {
    expect(scaleBarLabelForZoom({ physicalSizeX: null, unit: "µm", zoom: 0, scale: 1 })).toBeNull();
  });
});
