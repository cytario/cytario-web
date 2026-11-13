import { describe, expect, test } from "vitest";

import { capAtNativeResolution, pixelsForDensity, type ExportRenderLimits } from "../clamp";

const limits = (over: Partial<ExportRenderLimits> = {}): ExportRenderLimits => ({
  maxCanvasSide: 16384,
  areaLimit: 16384 * 16384,
  ...over,
});

describe("pixelsForDensity", () => {
  test("passes the preset's target size through unclamped", () => {
    const result = pixelsForDensity({
      targetWidthPx: 2000,
      targetHeightPx: 1500,
      limits: limits(),
    });

    expect(result.width).toBe(2000);
    expect(result.height).toBe(1500);
    expect(result.clamped).toBe(false);
  });

  test("scales each preset's target width (600 / 2000 / 3500 px)", () => {
    for (const target of [600, 2000, 3500] as const) {
      const result = pixelsForDensity({
        targetWidthPx: target,
        targetHeightPx: Math.round(target * (2 / 3)),
        limits: limits(),
      });
      expect(result.width).toBe(target % 2 === 0 ? target : target - 1);
    }
  });

  test("keeps the extent's own aspect — no aspect transformation", () => {
    const result = pixelsForDensity({
      targetWidthPx: 3000,
      targetHeightPx: 1000,
      limits: limits(),
    });

    expect(result.width / result.height).toBeCloseTo(3, 5);
  });

  test("clamps to the canvas side cap while keeping the aspect", () => {
    const result = pixelsForDensity({
      targetWidthPx: 5000,
      targetHeightPx: 4000,
      limits: limits({ maxCanvasSide: 4096 }),
    });

    expect(result.width).toBeLessThanOrEqual(8192);
    expect(result.height).toBeLessThanOrEqual(8192);
    expect(result.clamped).toBe(true);
  });

  test("clamps to the area limit even when both sides individually fit", () => {
    const result = pixelsForDensity({
      targetWidthPx: 15_000,
      targetHeightPx: 13_000,
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
