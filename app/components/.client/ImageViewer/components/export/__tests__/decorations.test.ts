import { describe, expect, test, vi } from "vitest";

import { millimetersPerUnit } from "../../canvas/Measurements/utils";
import {
  decorationFontPx,
  drawLegendDecoration,
  magnificationText,
  scaleBarForPixelSize,
  scaleBarLabelForPixelSize,
} from "../decorations";

const context = () =>
  ({
    canvas: { width: 1920, height: 1080 },
    fillStyle: "",
    font: "",
    textBaseline: "",
    fillRect: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
  }) as unknown as CanvasRenderingContext2D;

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

describe("scaleBarLabelForPixelSize", () => {
  test("resolves the ladder label at the export's mm-per-pixel", () => {
    // 0.25 µm/px: 100 µm bar is 400 px wide (too wide), 50 µm → 200 (too
    // wide), 20 µm → 80 px fits.
    expect(scaleBarLabelForPixelSize(0.00025)).toBe("20 µm");
  });

  test("returns null for a non-positive pixel size", () => {
    expect(scaleBarLabelForPixelSize(0)).toBeNull();
  });
});

describe("magnificationText", () => {
  test("renders the objective magnification when metadata declares it", () => {
    const result = magnificationText({ NominalMagnification: 40 });
    expect(result).toEqual({ text: "40×" });
  });

  test("omits the decoration when no objective magnification is declared", () => {
    expect(magnificationText({})).toBeNull();
  });

  test("omits the decoration without metadata", () => {
    expect(magnificationText(null)).toBeNull();
  });
});

describe("decorationFontPx", () => {
  test("one 12 pt font across presets — px = 12 × DPI / 72", () => {
    expect(decorationFontPx(90)).toBeCloseTo(15, 5);
    expect(decorationFontPx(300)).toBeCloseTo(50, 5);
    expect(decorationFontPx(600)).toBeCloseTo(100, 5);
  });
});

describe("drawLegendDecoration", () => {
  test("draws a chip and a label per legend item", () => {
    const ctx = context();
    drawLegendDecoration(
      ctx,
      [
        { name: "DAPI", color: [0, 255, 0] },
        { name: "CD8", color: [255, 0, 0, 255] },
      ],
      50,
    );

    // One backdrop + two chips; two name labels.
    expect(ctx.fillRect).toHaveBeenCalledTimes(3);
    expect(ctx.fillText).toHaveBeenCalledTimes(2);
    expect(ctx.fillStyle).toBe("rgba(20, 20, 20, 0.9)");
  });

  test("draws nothing with no items", () => {
    const ctx = context();
    drawLegendDecoration(ctx, [], 50);
    expect(ctx.fillRect).not.toHaveBeenCalled();
    expect(ctx.fillText).not.toHaveBeenCalled();
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
