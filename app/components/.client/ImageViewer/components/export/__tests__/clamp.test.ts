import { describe, expect, test } from "vitest";

import { capAtNativeResolution, pixelsForDensity, type ExportRenderLimits } from "../clamp";

const limits = (over: Partial<ExportRenderLimits> = {}): ExportRenderLimits => ({
  maxCanvasSide: 16384,
  areaLimit: 16384 * 16384,
  ...over,
});

describe("pixelsForDensity", () => {
  test("maps the framed extent's physical size through the DPI preset", () => {
    // A 25.4 mm extent at 300 DPI is exactly 300 px.
    const result = pixelsForDensity({
      widthMm: 25.4,
      heightMm: 25.4,
      dpi: 300,
      limits: limits(),
    });

    expect(result.width).toBe(300);
    expect(result.height).toBe(300);
    expect(result.clamped).toBe(false);
  });

  test("scales each preset against the same physical extent (90 / 300 / 600 DPI)", () => {
    const widthMm = 10;
    const heightMm = 5;
    for (const [dpi, expectedWidth] of [
      [90, Math.floor((10 / 25.4) * 90)],
      [300, Math.floor((10 / 25.4) * 300)],
      [600, Math.floor((10 / 25.4) * 600)],
    ] as const) {
      const result = pixelsForDensity({ widthMm, heightMm, dpi, limits: limits() });
      expect(result.width).toBe(expectedWidth % 2 === 0 ? expectedWidth : expectedWidth - 1);
      expect(result.height).toBe(
        Math.floor((5 / 25.4) * dpi) % 2 === 0
          ? Math.floor((5 / 25.4) * dpi)
          : Math.floor((5 / 25.4) * dpi) - 1,
      );
    }
  });

  test("keeps the extent's own aspect — no aspect transformation", () => {
    const result = pixelsForDensity({
      widthMm: 30,
      heightMm: 10,
      dpi: 600,
      limits: limits(),
    });

    expect(result.width / result.height).toBeCloseTo(3, 5);
  });

  test("clamps to the canvas side cap while keeping the aspect", () => {
    // 254 mm at 600 DPI is 6000 px; side-capped at 8192 the wide axis governs.
    const result = pixelsForDensity({
      widthMm: 500,
      heightMm: 400,
      dpi: 600,
      limits: limits({ maxCanvasSide: 8192 }),
    });

    expect(result.width).toBeLessThanOrEqual(8192);
    expect(result.height).toBeLessThanOrEqual(8192);
    expect(result.clamped).toBe(true);
  });

  test("clamps to the area limit even when both sides individually fit", () => {
    const result = pixelsForDensity({
      widthMm: 1500,
      heightMm: 1300,
      dpi: 600,
      // Side caps would allow 16384, but the area cap is tighter.
      limits: limits({ areaLimit: 100_000_000 }),
    });

    expect(result.width * result.height).toBeLessThanOrEqual(100_000_000);
    expect(result.clamped).toBe(true);
  });
});

describe("capAtNativeResolution", () => {
  test("passes sizes at or below native through", () => {
    const result = capAtNativeResolution(
      { width: 512, height: 512 },
      { width: 1024, height: 1024 },
    );
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    expect(result.upscaled).toBe(false);
  });

  test("flags an upscale beyond native and clamps at 2× native", () => {
    const result = capAtNativeResolution(
      { width: 4096, height: 4096 },
      { width: 1024, height: 1024 },
    );
    expect(result.width).toBe(2048);
    expect(result.height).toBe(2048);
    expect(result.upscaled).toBe(true);
  });

  test("allows up to 2× native, flagged as upscaled", () => {
    const result = capAtNativeResolution(
      { width: 2048, height: 2048 },
      { width: 1024, height: 1024 },
    );
    expect(result.width).toBe(2048);
    expect(result.upscaled).toBe(true);
  });
});
